import { homedir } from 'node:os'
import { join } from 'node:path'

/** Human readable byte count, used by the agent tool's text answers. */
export function fmtBytes(bytes) {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Directory the harness keeps per-profile state in; mirrors what other local plugins do. */
export function profileDirectory() {
  if (process.env.DSH_PROFILE_DIR) return process.env.DSH_PROFILE_DIR
  const profile = process.env.DSH_PROFILE || 'default'
  return join(homedir(), '.dsh', 'profiles', profile)
}

export function stateFilePath(name) {
  return join(profileDirectory(), name)
}

/** `HH:MM` in local time, or '' when the clock cannot be read. */
export function clockHHMM(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function parseClock(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return { hours, minutes, text: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` }
}
