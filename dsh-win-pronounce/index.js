/**
 * Host half of the dsh-win-pronounce bundle.
 *
 * Owns the switch and the persisted settings, enumerates the local Windows
 * voices, plays utterances through Windows PowerShell, serves the HTTP routes
 * the composer button calls, and keeps the `speak` tool registered only while
 * the switch is on.
 */
import { spawn } from 'node:child_process'
import { RATE_MAX, RATE_MIN, loadState, normalizeState, saveState } from './lib/state.js'
import { POWERSHELL, SPEAK_SCRIPT, encodeBase64, listVoices } from './lib/tts.js'
import { clampNumber } from './lib/util.js'

export const name = 'dsh-win-pronounce'
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-win-pronounce'
const CSRF_HEADER = 'x-dsh-win-pronounce'
const BODY_LIMIT = 64 * 1024
const MAX_SPOKEN_CHARS = 1200

const VOICE_TOOL_DESCRIPTION = [
  'Read a short message aloud through the local Windows voice the user switched on',
  'beside the composer toolbar. Use it for brief spoken lines: a status, a reminder,',
  'a confirmation, or a one-sentence answer. Keep the text conversational and short,',
  'do not read code, tables, or whole documents aloud, and do not repeat everything',
  'you already wrote.',
].join(' ')

const VOICE_PROMPT = [
  'Voice output is switched on in the composer toolbar: the user hears what you say.',
  'When a short sentence helps, call the speak tool with brief conversational text',
  'instead of only writing it. Never read code, tables, or long documents aloud.',
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

  function snapshot() {
    return {
      ok: true,
      enabled: state.enabled,
      voice: state.voice,
      rate: state.rate,
      volume: state.volume,
      speaking: active !== null,
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

  /**
   * Starts one utterance. Playback is asynchronous on purpose: the tool answer
   * must not wait for the audio, and the running process is what Stop kills.
   */
  function speakNow(text, force) {
    const message = String(text ?? '').trim()
    if (message === '') return { ok: false, error: 'there is no text to speak' }
    if (!state.enabled && force !== true) return { ok: false, error: 'voice output is switched off' }
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
    }
    child.once('exit', settle)
    child.once('error', settle)
    return { ok: true, voice: voiceId, spoken: clipped }
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
      stopActive()
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
    if (typeof body.voice === 'string' && body.voice !== '') next.voice = body.voice
    if (body.rate !== undefined) next.rate = clampNumber(body.rate, RATE_MIN, RATE_MAX, next.rate)
    if (body.volume !== undefined) next.volume = clampNumber(body.volume, 0, 1, next.volume)

    state.enabled = next.enabled
    state.voice = next.voice
    state.rate = next.rate
    state.volume = next.volume
    saveState(state)
    syncAgentSurface()

    if (!state.enabled) stopActive()
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
    stopActive()
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
