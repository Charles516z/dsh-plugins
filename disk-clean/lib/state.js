import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { categories } from './targets.js'
import { clampNumber, parseClock, stateFilePath } from './util.js'

const STATE_FILE = stateFilePath('.disk-clean-state.json')
const HISTORY_LIMIT = 20

const DEFAULT_SCHEDULE = { weekdaysAt: '21:00', weekendAt: '02:00' }
const DEFAULT_GUARD = { enabled: false, thresholdGb: 8, checkIntervalMin: 30 }

export function defaultConfig() {
  const enabled = {}
  const minAgeHours = {}
  for (const category of categories()) {
    enabled[category.id] = category.kind === 'safe'
    minAgeHours[category.id] = category.minAgeHours
  }
  return {
    enabled: true,
    schedule: { ...DEFAULT_SCHEDULE },
    guard: { ...DEFAULT_GUARD },
    categories: enabled,
    minAgeHours,
  }
}

/** An empty string disables one slot; any unreadable value keeps the previous setting. */
function normalizeClock(value, fallback) {
  if (typeof value !== 'string') return fallback
  if (value.trim() === '') return ''
  const clock = parseClock(value)
  return clock ? clock.text : fallback
}

/** Accept only known ids and clamped numbers: the page and the tool both feed this. */
export function normalizeConfig(input, base = defaultConfig()) {
  const baseSchedule = base.schedule ?? DEFAULT_SCHEDULE
  const baseGuard = base.guard ?? DEFAULT_GUARD
  const next = {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : base.enabled,
    schedule: {
      weekdaysAt: normalizeClock(input?.schedule?.weekdaysAt, baseSchedule.weekdaysAt),
      weekendAt: normalizeClock(input?.schedule?.weekendAt, baseSchedule.weekendAt),
    },
    guard: {
      enabled: typeof input?.guard?.enabled === 'boolean' ? input.guard.enabled : baseGuard.enabled,
      thresholdGb: clampNumber(input?.guard?.thresholdGb, 0.5, 500, baseGuard.thresholdGb),
      checkIntervalMin: Math.round(clampNumber(input?.guard?.checkIntervalMin, 5, 1440, baseGuard.checkIntervalMin)),
    },
    categories: { ...base.categories },
    minAgeHours: { ...base.minAgeHours },
  }

  // 1.0 stored the threshold trigger flat; keep the numbers but let the new schedule drive,
  // so an upgrade does not start cleaning every half hour behind the user's back.
  if (input && input.guard === undefined && input.schedule === undefined) {
    if (input.thresholdGb !== undefined) next.guard.thresholdGb = clampNumber(input.thresholdGb, 0.5, 500, baseGuard.thresholdGb)
    if (input.checkIntervalMin !== undefined) {
      next.guard.checkIntervalMin = Math.round(clampNumber(input.checkIntervalMin, 5, 1440, baseGuard.checkIntervalMin))
    }
  }

  const ids = new Set(categories().map((category) => category.id))
  if (input?.categories && typeof input.categories === 'object') {
    for (const [id, value] of Object.entries(input.categories)) {
      if (ids.has(id) && typeof value === 'boolean') next.categories[id] = value
    }
  }
  if (input?.minAgeHours && typeof input.minAgeHours === 'object') {
    for (const [id, value] of Object.entries(input.minAgeHours)) {
      if (!ids.has(id)) continue
      const hours = clampNumber(value, 0, 24 * 365, null)
      if (hours !== null) next.minAgeHours[id] = hours
    }
  }
  return next
}

export function emptyState() {
  return {
    version: 2,
    config: defaultConfig(),
    lastScheduled: { weekday: '', weekend: '' },
    lastScan: null,
    lastClean: null,
    history: [],
  }
}

export function loadState() {
  const fallback = emptyState()
  let parsed
  try {
    parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return fallback
  }
  if (!parsed || typeof parsed !== 'object') return fallback
  const state = emptyState()
  state.config = normalizeConfig(parsed.config, fallback.config)
  if (parsed.lastScheduled && typeof parsed.lastScheduled === 'object') {
    for (const slot of ['weekday', 'weekend']) {
      const value = parsed.lastScheduled[slot]
      if (typeof value === 'string') state.lastScheduled[slot] = value
    }
  }
  state.lastScan = parsed.lastScan && typeof parsed.lastScan === 'object' ? parsed.lastScan : null
  state.lastClean = parsed.lastClean && typeof parsed.lastClean === 'object' ? parsed.lastClean : null
  if (Array.isArray(parsed.history)) {
    state.history = parsed.history
      .filter((entry) => entry && typeof entry === 'object' && Number.isFinite(entry.at))
      .slice(0, HISTORY_LIMIT)
  }
  return state
}

export function saveState(state) {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true })
    const body = JSON.stringify(
      {
        version: 2,
        config: state.config,
        lastScheduled: state.lastScheduled,
        lastScan: state.lastScan,
        lastClean: state.lastClean,
        history: state.history.slice(0, HISTORY_LIMIT),
      },
      null,
      2,
    )
    const temporary = `${STATE_FILE}.tmp`
    writeFileSync(temporary, body, 'utf8')
    renameSync(temporary, STATE_FILE)
  } catch {
    // A read-only profile directory must not break cleaning; state simply is not kept.
  }
}
