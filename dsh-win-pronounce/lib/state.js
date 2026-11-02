import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { clampNumber, stateFilePath } from './util.js'

const STATE_FILE = stateFilePath('.dsh-win-pronounce.json')

export const RATE_MIN = 0.6
export const RATE_MAX = 1.8

/** Coerces whatever was on disk into the shape the plugin expects. */
export function normalizeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    version: 1,
    enabled: source.enabled === true,
    voice: typeof source.voice === 'string' ? source.voice : '',
    rate: clampNumber(source.rate, RATE_MIN, RATE_MAX, 1),
    volume: clampNumber(source.volume, 0, 1, 1),
  }
}

/** Reads the persisted switch/voice settings; a missing or broken file means defaults. */
export function loadState() {
  try {
    return normalizeState(JSON.parse(readFileSync(STATE_FILE, 'utf8')))
  } catch {
    return normalizeState(null)
  }
}

/** Writes the settings atomically; failures stay silent so speaking never breaks on I/O. */
export function saveState(state) {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true })
    const temporary = STATE_FILE + '.tmp'
    writeFileSync(temporary, JSON.stringify(normalizeState(state), null, 2), 'utf8')
    renameSync(temporary, STATE_FILE)
  } catch {
    // Persistence is best effort: the switch still works for this session.
  }
}
