/**
 * Host half of the dsh-win-pronounce bundle.
 *
 * Owns the switch and the persisted settings, enumerates the local Windows
 * voices, plays utterances through Windows PowerShell, serves the HTTP routes
 * the composer button calls, and keeps the `speak` tool registered only while
 * the switch is on.
 */
import { spawn } from 'node:child_process'
import { buildUtterances } from './lib/speech.js'
import { RATE_MAX, RATE_MIN, loadState, normalizeState, saveState } from './lib/state.js'
import { POWERSHELL, SPEAK_SCRIPT, encodeBase64, listVoices } from './lib/tts.js'
import { clampNumber } from './lib/util.js'

export const name = 'dsh-win-pronounce'
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-win-pronounce'
const CSRF_HEADER = 'x-dsh-win-pronounce'
const BODY_LIMIT = 64 * 1024
const MAX_SPOKEN_CHARS = 1200
const REPLY_CHUNK_CHARS = 220
const REPLY_TOTAL_CHARS = 4000

const VOICE_TOOL_DESCRIPTION = [
  'Say a short line aloud through the local Windows voice the user switched on beside the',
  'composer toolbar. The closing reply of every turn is already read aloud automatically, so',
  'use this only for a short extra line that is not part of it: a heads-up before a long task,',
  'a warning, or a confirmation the user should hear right away. Keep it conversational and',
  'short; never read code, tables, or whole documents aloud.',
].join(' ')

const VOICE_PROMPT = [
  'Voice output is switched on in the composer toolbar: the local Windows voice reads your',
  'closing reply aloud automatically, so write that reply as something worth hearing — the',
  'points in plain sentences first, code and tables only after the point is made, and no long',
  'file dumps. Call the speak tool only for a brief line that is not already in that reply,',
  'such as a heads-up before a long task; never repeat the reply through it.',
].join(' ')

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

function sameOriginRequest(req) {
  const marker = req.headers[CSRF_HEADER]
  const header = Array.isArray(marker) ? marker[0] : marker
  if (header !== '1') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    try {
      if (new URL(origin).host !== req.headers.host) return false
    } catch {
      return false
    }
  }
  return true
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error('request body timed out')), 10_000)
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        fail(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', (error) => fail(error))
  })
}

export function apply(ctx) {
  const state = loadState()

  let voices = []
  let voiceError = ''
  let voicesLoaded = false
  let voicesRequest = null
  let active = null
  let toolDispose = null
  let promptDispose = null

  /** Utterances waiting for the current one to finish, in order. */
  const queue = []
  /** sessionId -> text of the last assistant message seen in the running turn. */
  const pendingReplies = new Map()

  function snapshot() {
    return {
      ok: true,
      enabled: state.enabled,
      readReplies: state.readReplies,
      voice: state.voice,
      rate: state.rate,
      volume: state.volume,
      speaking: active !== null || queue.length > 0,
      voices,
      voiceError,
    }
  }

  function chooseFallbackVoice() {
    if (voices.length === 0) return
    if (voices.some((voice) => voice.id === state.voice)) return
    const preferred = voices.find((voice) => /^zh/i.test(voice.lang ?? '')) ?? voices[0]
    state.voice = preferred.id
    saveState(state)
  }

  async function ensureVoices(force) {
    if (force) {
      voicesLoaded = false
      voicesRequest = null
    }
    if (voicesLoaded) return
    if (!voicesRequest) {
      voicesRequest = listVoices()
        .then((list) => {
          voices = list
          voiceError = ''
          chooseFallbackVoice()
        })
        .catch((failure) => {
          voiceError = String(failure?.message ?? failure)
        })
        .finally(() => {
          voicesLoaded = true
          voicesRequest = null
        })
    }
    await voicesRequest
  }

  function resolveVoiceId() {
    if (state.voice && voices.some((voice) => voice.id === state.voice)) return state.voice
    return voices[0]?.id ?? ''
  }

  function stopActive() {
    const child = active
    active = null
    if (!child) return false
    try {
      child.kill()
    } catch {
      // The process may already be gone.
    }
    return true
  }

  /** Drops whatever was queued and silences the utterance in flight. */
  function stopAll() {
    queue.length = 0
    return stopActive()
  }

  /**
   * Starts one utterance and hands back the child process. Playback is
   * asynchronous on purpose: neither the tool answer nor the session feed may
   * wait for the audio, and the running process is what Stop kills.
   */
  function startSpeech(text) {
    const message = String(text ?? '').trim()
    if (message === '') return { ok: false, error: 'there is no text to speak' }
    const voiceId = resolveVoiceId()
    if (voiceId === '') return { ok: false, error: voiceError || 'no local Windows voice is installed' }

    const clipped = message.length > MAX_SPOKEN_CHARS ? message.slice(0, MAX_SPOKEN_CHARS) : message
    stopActive()

    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SPEAK_SCRIPT,
      '-VoiceB64',
      encodeBase64(voiceId),
      '-TextB64',
      encodeBase64(clipped),
      '-Rate',
      String(state.rate),
      '-Volume',
      String(state.volume),
    ]

    let child
    try {
      child = spawn(POWERSHELL, args, { windowsHide: true, stdio: 'ignore' })
    } catch (failure) {
      return { ok: false, error: `could not start the speech host: ${String(failure?.message ?? failure)}` }
    }

    active = child
    const settle = () => {
      if (active === child) active = null
      pump()
    }
    child.once('exit', settle)
    child.once('error', settle)
    return { ok: true, voice: voiceId, spoken: clipped, child }
  }

  /** Plays the head of the queue whenever the current utterance has finished. */
  function pump() {
    if (active !== null) return
    if (queue.length === 0) return
    if (!state.enabled) {
      queue.length = 0
      return
    }
    const started = startSpeech(queue.shift())
    if (!started.ok) {
      queue.length = 0
      voiceError = started.error
    }
  }

  /** Explicit speech (the tool, or the preview button) wins over a queued reply. */
  function speakNow(text, force) {
    if (!state.enabled && force !== true) return { ok: false, error: 'voice output is switched off' }
    queue.length = 0
    const started = startSpeech(text)
    if (!started.ok) return started
    return { ok: true, voice: started.voice, spoken: started.spoken }
  }

  /** Queues a whole reply, already stripped of markdown and cut into utterances. */
  function enqueueReply(markdown) {
    if (!state.enabled || state.readReplies !== true) return
    const chunks = buildUtterances(markdown, REPLY_CHUNK_CHARS, REPLY_TOTAL_CHARS)
    if (chunks.length === 0) return
    queue.length = 0
    for (const chunk of chunks) queue.push(chunk)
    pump()
  }

  /** The visible text of one assistant message; reasoning and tool calls are skipped. */
  function messageText(message) {
    const blocks = Array.isArray(message?.content)
      ? message.content
      : Array.isArray(message?.blocks)
        ? message.blocks
        : []
    const parts = []
    for (const block of blocks) {
      if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
        parts.push(block.text)
      }
    }
    return parts.join('\n\n')
  }

  /**
   * Reads the closing reply of every finished turn aloud.
   *
   * `assistant/message` events keep the latest text of the running turn; when
   * that turn ends normally the text is spoken once, chunk by chunk. Subagent
   * sessions stay silent, and so does an interrupted turn.
   */
  function onSessionEvent(session, event) {
    try {
      if (!state.enabled || state.readReplies !== true) return
      if (!session || !event || typeof event?.type !== 'string') return
      if (session.header?.origin === 'subagent') return
      const sessionId = String(session.id ?? '')
      if (sessionId === '') return

      if (event.type === 'turn/start') {
        pendingReplies.delete(sessionId)
        return
      }

      if (event.type === 'assistant/message') {
        const data = event.data ?? {}
        if (data.interrupted === true) return
        const text = messageText(data.message)
        if (text.trim() === '') return
        pendingReplies.set(sessionId, text)
        return
      }

      if (event.type === 'turn/end') {
        const text = pendingReplies.get(sessionId)
        pendingReplies.delete(sessionId)
        if (typeof text !== 'string' || text.trim() === '') return
        if (event.data?.reason?.kind !== 'completed') return
        enqueueReply(text)
      }
    } catch (failure) {
      // A listener that throws would break the append feed; stay silent.
      voiceError = `the reply reader skipped one turn: ${String(failure?.message ?? failure)}`
    }
  }

  function registerSpeakTool() {
    const tools = ctx.get('tools')
    if (!tools || typeof tools.register !== 'function') return null
    try {
      return tools.register({
        name: 'speak',
        description: VOICE_TOOL_DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                'Short conversational text to say aloud, in the language of the user. No markdown, code, or tables.',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              spoken: { type: 'string' },
              voice: { type: 'string' },
              error: { type: 'string' },
            },
            additionalProperties: false,
          },
          render: (_args, value) => {
            if (value?.ok) return [{ type: 'text', text: `Speaking aloud: ${String(value?.spoken ?? '')}` }]
            return [{ type: 'text', text: `Could not speak: ${String(value?.error ?? 'unknown error')}` }]
          },
        },
        execute: async (args) => {
          const result = speakNow(args?.text, false)
          if (!result.ok) return { ok: false, error: result.error }
          return { ok: true, spoken: result.spoken, voice: result.voice }
        },
      })
    } catch (failure) {
      voiceError = `the speak tool could not be registered: ${String(failure?.message ?? failure)}`
      return null
    }
  }

  function registerVoicePrompt() {
    const systemPrompt = ctx.get('systemPrompt')
    if (!systemPrompt || typeof systemPrompt.context !== 'function') return null
    try {
      return systemPrompt.context({ name: 'dsh-win-pronounce', order: 60, text: VOICE_PROMPT })
    } catch {
      return null
    }
  }

  /** Keeps the agent-facing surface in sync with the switch. */
  function syncAgentSurface() {
    if (state.enabled && !toolDispose) toolDispose = registerSpeakTool()
    if (!state.enabled && toolDispose) {
      const dispose = toolDispose
      toolDispose = null
      try {
        dispose()
      } catch {
        // Already gone.
      }
    }
    if (state.enabled && !promptDispose) promptDispose = registerVoicePrompt()
    if (!state.enabled && promptDispose) {
      const dispose = promptDispose
      promptDispose = null
      try {
        dispose()
      } catch {
        // Already gone.
      }
    }
  }

  syncAgentSurface()

  ctx.effect(
    () => {
      const dispose = ctx.on('session/event', onSessionEvent)
      return () => {
        pendingReplies.clear()
        if (typeof dispose === 'function') {
          try {
            dispose()
          } catch {
            // Already gone.
          }
        }
      }
    },
    'dsh-win-pronounce: reply feed',
  )

  ctx.effect(
    () => () => {
      if (toolDispose) {
        try {
          toolDispose()
        } catch {
          // Already gone.
        }
        toolDispose = null
      }
      if (promptDispose) {
        try {
          promptDispose()
        } catch {
          // Already gone.
        }
        promptDispose = null
      }
      pendingReplies.clear()
      stopAll()
    },
    'dsh-win-pronounce: disposal',
  )

  async function onState(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    await ensureVoices(false)
    sendJson(res, 200, snapshot())
  }

  async function onConfig(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    if (!sameOriginRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
      return
    }
    let body
    try {
      body = await readJsonBody(req, BODY_LIMIT)
    } catch (failure) {
      sendJson(res, 400, { ok: false, error: String(failure?.message ?? failure) })
      return
    }

    const next = normalizeState(state)
    if (typeof body.enabled === 'boolean') next.enabled = body.enabled
    if (typeof body.readReplies === 'boolean') next.readReplies = body.readReplies
    if (typeof body.voice === 'string' && body.voice !== '') next.voice = body.voice
    if (body.rate !== undefined) next.rate = clampNumber(body.rate, RATE_MIN, RATE_MAX, next.rate)
    if (body.volume !== undefined) next.volume = clampNumber(body.volume, 0, 1, next.volume)

    state.enabled = next.enabled
    state.readReplies = next.readReplies
    state.voice = next.voice
    state.rate = next.rate
    state.volume = next.volume
    saveState(state)
    syncAgentSurface()

    if (!state.enabled) {
      pendingReplies.clear()
      stopAll()
    } else if (state.readReplies !== true) {
      pendingReplies.clear()
      queue.length = 0
    }
    sendJson(res, 200, snapshot())
  }

  async function onPreview(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    if (!sameOriginRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
      return
    }
    await ensureVoices(false)
    const voice = voices.find((candidate) => candidate.id === resolveVoiceId())
    const chinese = /^zh/i.test(voice?.lang ?? state.voice)
    const sample = chinese
      ? '你好，本地语音已经接上了，这是试听。'
      : 'Hello, the local voice is connected. This is a preview.'
    const result = speakNow(sample, true)
    sendJson(res, 200, { ...snapshot(), ok: result.ok, error: result.ok ? '' : result.error })
  }

  async function onStop(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    if (!sameOriginRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
      return
    }
    stopAll()
    sendJson(res, 200, snapshot())
  }

  async function onRefresh(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    if (!sameOriginRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
      return
    }
    await ensureVoices(true)
    sendJson(res, 200, snapshot())
  }

  ctx.effect(() => {
    const server = ctx.get('webServer')
    if (!server || typeof server.register !== 'function') {
      voiceError = 'the web server service is unavailable, so the composer button cannot reach the plugin'
      return
    }
    const disposers = [
      server.register({ kind: 'exact', path: `${ROUTE_PREFIX}/state`, handler: onState }),
      server.register({ kind: 'exact', path: `${ROUTE_PREFIX}/config`, handler: onConfig }),
      server.register({ kind: 'exact', path: `${ROUTE_PREFIX}/preview`, handler: onPreview }),
      server.register({ kind: 'exact', path: `${ROUTE_PREFIX}/stop`, handler: onStop }),
      server.register({ kind: 'exact', path: `${ROUTE_PREFIX}/refresh`, handler: onRefresh }),
    ]
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // Already gone.
        }
      }
    }
  }, 'dsh-win-pronounce: http routes')
}
