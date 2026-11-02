import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ASSETS_DIR = join(PACKAGE_ROOT, 'assets')

export const VOICES_SCRIPT = join(ASSETS_DIR, 'voices.ps1')
export const SPEAK_SCRIPT = join(ASSETS_DIR, 'speak.ps1')

/**
 * Windows PowerShell 5.1 is the script host: the OneCore voices are only
 * reachable through the WinRT projection it still carries, and SAPI needs the
 * full .NET Framework assembly.
 */
export const POWERSHELL = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)

const VOICES_MARKER = '@@VOICES@@'
const ENUMERATION_TIMEOUT_MS = 30_000

/** Base64 keeps user text out of PowerShell's quoting and code-page rules. */
export function encodeBase64(text) {
  return Buffer.from(String(text), 'utf8').toString('base64')
}

function describeFailure(error, stderr) {
  const detail = String(stderr ?? '').trim().split(/\r?\n/).filter(Boolean).pop()
  const reason = error?.message ? String(error.message) : 'voice enumeration failed'
  return detail ? `${reason}: ${detail}` : reason
}

/**
 * Asks the script host for every local voice it can reach.
 * Resolves to `[{ id, engine, name, lang, gender }]`.
 */
export function listVoices() {
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', VOICES_SCRIPT],
      { windowsHide: true, timeout: ENUMERATION_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(describeFailure(error, stderr)))
          return
        }
        const line = String(stdout ?? '')
          .split(/\r?\n/)
          .find((candidate) => candidate.startsWith(VOICES_MARKER))
        if (!line) {
          reject(new Error('voice enumeration produced no data'))
          return
        }
        try {
          const parsed = JSON.parse(line.slice(VOICES_MARKER.length))
          const raw = Array.isArray(parsed?.voices) ? parsed.voices : []
          const voices = raw
            .filter((voice) => voice && typeof voice.id === 'string' && voice.id !== '')
            .map((voice) => ({
              id: voice.id,
              engine: voice.engine === 'onecore' ? 'onecore' : 'sapi',
              name: typeof voice.name === 'string' && voice.name !== '' ? voice.name : voice.id,
              lang: typeof voice.lang === 'string' ? voice.lang : '',
              gender: typeof voice.gender === 'string' ? voice.gender : '',
            }))
          resolve(voices)
        } catch (failure) {
          reject(new Error(`voice enumeration returned unreadable data: ${String(failure?.message ?? failure)}`))
        }
      },
    )
  })
}
