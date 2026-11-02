/**
 * Auto-compact: compress every live session's context every morning before the
 * token rush, with a startup catch-up run and a manual `/compact-all` entry.
 *
 * The compaction capability is not a Host service in Web profiles: it is
 * mounted inside each Agent's isolated preset group. `agentPresets.serviceFor`
 * resolves that per-agent instance; a Host-level `compaction` service is used
 * only as a fallback.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-autocompress'
export const inject = ['agents']

const DEFAULTS = Object.freeze({
  /** Local wall-clock time of the daily run. */
  time: '08:30',
  /** Run once after startup when today's slot was missed. */
  catchUp: true,
  /** 'all' (every live session) or 'roots' (top-level sessions only). */
  target: 'all',
  /** Delayed retries for sessions that were busy at the scheduled time. */
  retries: 2,
  retryMinutes: 10,
  /** Abort one session's compaction after this long. */
  timeoutMinutes: 30,
  /** Give the Host this long to settle before a catch-up run. */
  settleSeconds: 20,
  /** Pause between two sessions so the provider is not burst-loaded. */
  gapMs: 250,
})

const STATE_FILE = '.auto-compact-state.json'
const DAY_MS = 86_400_000

function profileDir() {
  const explicit = process.env.DSH_PROFILE_DIR
  if (explicit !== undefined && explicit.length > 0) return explicit
  const profile = process.env.DSH_PROFILE ?? 'desktop'
  return path.join(os.homedir(), '.dsh', 'profiles', profile)
}

function statePath() {
  return path.join(profileDir(), STATE_FILE)
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    /* the state file is an optimisation; an in-memory run still works */
  }
}

function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseClock(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim())
  if (match === null) return { hours: 8, minutes: 30 }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return { hours: 8, minutes: 30 }
  return { hours, minutes }
}

function todayAt(now, clock) {
  const target = new Date(now.getTime())
  target.setHours(clock.hours, clock.minutes, 0, 0)
  return target
}

function nextRunAt(now, clock) {
  const target = todayAt(now, clock)
  if (target.getTime() <= now.getTime()) target.setTime(target.getTime() + DAY_MS)
  return target
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function makeLogger(ctx) {
  try {
    if (typeof ctx.logger === 'function') {
      const logger = ctx.logger('dsh-autocompress')
      if (logger !== undefined && logger !== null && typeof logger.info === 'function') return logger
    }
  } catch {
    /* fall through to the console */
  }
  const prefix = '[dsh-autocompress]'
  return {
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
  }
}

/** Resolve the compaction instance that owns one Agent's composition. */
function resolveCompaction(ctx, agent) {
  const notes = []
  let preset
  const presets = ctx.get('agentPresets')
  if (presets === undefined || presets === null) {
    notes.push('no-agentPresets')
  } else {
    try {
      if (typeof presets.composedPreset === 'function') preset = presets.composedPreset(agent.ctx)
    } catch {
      notes.push('composedPreset-failed')
    }
    if (typeof presets.serviceFor !== 'function') {
      notes.push('no-serviceFor')
    } else {
      try {
        const scoped = presets.serviceFor(agent, 'compaction')
        if (scoped !== undefined && scoped !== null) return { service: scoped, via: 'preset', preset }
        notes.push('serviceFor-undefined')
      } catch (error) {
        notes.push(`serviceFor-threw:${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  const host = ctx.get('compaction')
  if (host !== undefined && host !== null) return { service: host, via: 'host', preset }
  notes.push(`host-compaction:${typeof host}`)
  return { service: undefined, via: undefined, preset, notes: notes.join(' | ') }
}

function failureCode(error) {
  if (error !== null && typeof error === 'object' && typeof error.code === 'string') return error.code
  return 'error'
}

async function compactAgent(ctx, agent, opts, signal) {
  const sessionId = String(agent.id)
  if (agent.status !== 'idle') return { sessionId, outcome: 'busy' }
  if (typeof agent.runMaintenance !== 'function') return { sessionId, outcome: 'unsupported' }
  const resolved = resolveCompaction(ctx, agent)
  const compaction = resolved.service
  if (compaction === undefined || compaction === null || typeof compaction.compactNow !== 'function') {
    return { sessionId, outcome: 'unavailable', detail: resolved.notes, preset: resolved.preset }
  }
  const controller = new AbortController()
  const forward = () => controller.abort(signal.reason)
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', forward, { once: true })
  const guard = setTimeout(() => controller.abort(new Error('compaction timed out')), Math.max(1, opts.timeoutMinutes) * 60_000)
  try {
    const result = await compaction.compactNow(agent, controller.signal)
    if (result === null || result === undefined) return { sessionId, outcome: 'nothing' }
    return {
      sessionId,
      outcome: 'compacted',
      items: Array.isArray(result.shadowedSeqs) ? result.shadowedSeqs.length : 0,
      tokens: typeof result.shadowedTokenCount === 'number' ? result.shadowedTokenCount : 0,
    }
  } catch (error) {
    const code = failureCode(error)
    if (code === 'busy') return { sessionId, outcome: 'busy' }
    if (code === 'cancelled') return { sessionId, outcome: signal.aborted ? 'cancelled' : 'timed-out' }
    return { sessionId, outcome: code, detail: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(guard)
    signal.removeEventListener('abort', forward)
  }
}

async function compactAll(ctx, opts, signal) {
  let agents = []
  try {
    agents = opts.target === 'roots' && typeof ctx.agents.roots === 'function'
      ? ctx.agents.roots()
      : ctx.agents.list()
  } catch {
    agents = []
  }
  const results = []
  for (const agent of agents) {
    if (signal.aborted) break
    if (agent === undefined || agent === null || agent.id === undefined) continue
    results.push(await compactAgent(ctx, agent, opts, signal))
    if (opts.gapMs > 0) await sleep(opts.gapMs)
  }
  return results
}

function resultLine(result) {
  switch (result.outcome) {
    case 'compacted':
      return `路 ${result.sessionId}: 鍘嬬缉 ${result.items} 鏉″巻鍙诧紙绾?${result.tokens} tokens锛塦
    case 'nothing':
      return `路 ${result.sessionId}: 娌℃湁鍙帇缂╃殑鍘嗗彶`
    case 'busy':
      return `路 ${result.sessionId}: 姝ｅ湪杩愯锛屽凡璺宠繃`
    case 'cancelled':
      return `路 ${result.sessionId}: 宸插彇娑坄
    case 'timed-out':
      return `路 ${result.sessionId}: 瓒呮椂涓`
    case 'unavailable':
      return `路 ${result.sessionId}: 璇ヤ細璇濇病鏈夊彲鐢ㄧ殑鍘嬬缉鏈嶅姟${result.preset === undefined ? '' : `锛坧reset=${result.preset}锛塦}${result.detail === undefined ? '' : ` [${result.detail}]`}`
    case 'unsupported':
      return `路 ${result.sessionId}: 浼氳瘽涓嶆敮鎸佺淮鎶ゅ帇缂ー
    case 'changed':
      return `路 ${result.sessionId}: 鍘嗗彶鍦ㄥ帇缂╂湡闂村彂鐢熷彉鍖栵紝宸叉斁寮冩湰娆
    case 'summary':
      return `路 ${result.sessionId}: 鏈兘鐢熸垚鍙敤鎽樿`
    case 'commit':
      return `路 ${result.sessionId}: 鎻愪氦涓柇锛屽巻鍙插彲鑳藉凡閮ㄥ垎鏀瑰彉`
    case 'persistence':
      return `路 ${result.sessionId}: 鍘嬬缉瀹屾垚浣嗕細璇濅繚瀛樺け璐
    default:
      return `路 ${result.sessionId}: 澶辫触锛?{result.detail ?? result.outcome}锛塦
  }
}

function renderReport(results, trigger, at) {
  const head = trigger === 'manual'
    ? `绔嬪嵆鍘嬬缉 路 ${at.toLocaleString()}`
    : `${trigger === 'catch-up' ? '鍚姩琛ュ帇' : '姣忔棩瀹氭椂鍘嬬缉'} 路 ${at.toLocaleString()}`
  if (results.length === 0) return `${head}\n路 褰撳墠娌℃湁瀛樻椿浼氳瘽`
  const compacted = results.filter((r) => r.outcome === 'compacted')
  const tokens = compacted.reduce((sum, r) => sum + (r.tokens ?? 0), 0)
  const tail = compacted.length === 0
    ? '鏈帇缂╀换浣曞巻鍙层€?
    : `鍏卞帇缂?${compacted.length} 涓細璇濓紝绾?${tokens} tokens銆俙
  return [head, ...results.map(resultLine), tail].join('\n')
}

export function apply(ctx, rawConfig) {
  const opts = { ...DEFAULTS, ...(rawConfig !== null && typeof rawConfig === 'object' ? rawConfig : {}) }
  const clock = parseClock(opts.time)
  const log = makeLogger(ctx)
  const state = readState()
  const controller = new AbortController()
  let stopped = false
  let timerDispose
  let retryDispose
  let pendingRetries = Math.max(0, Number(opts.retries) || 0)

  // Plain timers: the timer service is an optional injected service and this
  // plugin must load even when it is disabled. Everything below is cleared by
  // the lifecycle disposer.
  const defer = (callback, delay) => {
    const handle = setTimeout(callback, delay)
    return () => clearTimeout(handle)
  }

  const cancelTimer = () => {
    if (timerDispose !== undefined) {
      try {
        timerDispose()
      } catch {
        /* already fired */
      }
      timerDispose = undefined
    }
  }

  const cancelRetry = () => {
    if (retryDispose !== undefined) {
      try {
        retryDispose()
      } catch {
        /* already fired */
      }
      retryDispose = undefined
    }
  }

  const scheduleAt = (date) => {
    if (stopped) return
    cancelTimer()
    const delay = Math.max(1_000, date.getTime() - Date.now())
    timerDispose = defer(() => {
      timerDispose = undefined
      void run('scheduled')
    }, delay)
  }

  const scheduleNext = () => {
    scheduledDay = dayKey(new Date())
    scheduleAt(nextRunAt(new Date(), clock))
  }

  const run = async (trigger) => {
    if (stopped) return
    if (trigger !== 'manual' && state.lastRunDay === dayKey(new Date())) {
      // A second wake-up on the same day (clock drift, sleep/resume) must not
      // pay for another summary round.
      scheduleNext()
      return
    }
    const startedAt = new Date()
    const results = await compactAll(ctx, opts, controller.signal)
    state.lastRunDay = dayKey(startedAt)
    state.lastRunAt = startedAt.toISOString()
    state.lastTrigger = trigger
    state.lastResults = results
    writeState(state)
    log.info(renderReport(results, trigger, startedAt))

    const busy = results.filter((result) => result.outcome === 'busy')
    cancelRetry()
    if (!stopped && busy.length > 0 && pendingRetries > 0 && trigger !== 'manual') {
      pendingRetries -= 1
      retryDispose = defer(() => {
        retryDispose = undefined
        void retryBusy(busy.map((result) => result.sessionId))
      }, Math.max(1, Number(opts.retryMinutes) || 10) * 60_000)
    }
    if (trigger !== 'manual') scheduleNext()
  }

  const retryBusy = async (sessionIds) => {
    if (stopped) return
    const results = []
    for (const sessionId of sessionIds) {
      if (controller.signal.aborted) break
      const agent = ctx.agents.get(sessionId)
      if (agent === undefined || agent === null) continue
      results.push(await compactAgent(ctx, agent, opts, controller.signal))
    }
    if (results.length > 0) log.info(renderReport(results, 'scheduled', new Date()))
  }

  let scheduledDay = state.lastRunDay

  ctx.effect(() => {
    const commands = ctx.get('commands')
    if (commands !== undefined && commands !== null && typeof commands.register === 'function') {
      ctx.effect(() => commands.register({
        name: 'compact-all',
        description: `绔嬪嵆鍘嬬缉鎵€鏈夌┖闂蹭細璇濈殑涓婁笅鏂囷紙姣忔棩 ${opts.time} 鑷姩鎵ц锛塦,
        handler: async (invocation) => {
          const signal = invocation !== null && typeof invocation === 'object' && invocation.signal !== undefined
            ? invocation.signal
            : controller.signal
          const startedAt = new Date()
          const results = await compactAll(ctx, opts, signal)
          const text = renderReport(results, 'manual', startedAt)
          const failed = results.some((result) => !['compacted', 'nothing', 'busy'].includes(result.outcome))
          return { kind: failed ? 'error' : 'success', text }
        },
      }), 'dsh-autocompress command')
    }

    const now = new Date()
    const today = todayAt(now, clock)
    if (opts.catchUp && now.getTime() >= today.getTime() && scheduledDay !== dayKey(now)) {
      log.info(`浠婃棩 ${opts.time} 鐨勫帇缂╂湭鎵ц锛?{Math.max(0, Number(opts.settleSeconds) || 0)} 绉掑悗琛ュ帇涓€娆)
      timerDispose = defer(() => {
        timerDispose = undefined
        void run('catch-up')
      }, Math.max(0, Number(opts.settleSeconds) || 0) * 1_000)
    } else {
      scheduleNext()
    }

    return () => {
      stopped = true
      cancelTimer()
      cancelRetry()
      controller.abort(new Error('dsh-autocompress disposed'))
    }
  }, 'dsh-autocompress lifecycle')
}
