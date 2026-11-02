import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function isDirectory(candidate) {
  try {
    return statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

/**
 * The desktop application launches the Host with the profile directory as a
 * positional argument (`... dsh <profileDir> ...`). The environment variable is
 * only injected into child processes the Harness spawns, so it cannot be relied
 * on from inside the Host itself.
 */
function findProfileArgument(argv) {
  for (const argument of argv ?? []) {
    if (typeof argument !== 'string') continue
    if (!/[\\/]profiles[\\/][^\\/]+$/.test(argument)) continue
    if (isDirectory(argument)) return argument
  }
  return undefined
}

/** The profile directory this Harness instance runs from. */
export function profileDirectory() {
  const fromEnv = process.env.DSH_PROFILE_DIR
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  const fromArgv = findProfileArgument(process.argv)
  if (fromArgv) return fromArgv
  return join(homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE ?? 'default')
}

/** Absolute path of a file the plugin keeps inside the profile directory. */
export function stateFilePath(fileName) {
  return join(profileDirectory(), fileName)
}

/** Clamps a numeric input into [min, max], falling back when it is not a number. */
export function clampNumber(value, min, max, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < min) return min
  if (numeric > max) return max
  return numeric
}
