import os from 'node:os'
import { join } from 'node:path'

const LOCAL = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local')
const ROAMING = process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming')
const WINDIR = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
const PROGRAMDATA = process.env.ProgramData || 'C:\\ProgramData'

/** Chromium keeps its caches in a few fixed sub-directories of every profile. */
function browserCacheRoots() {
  const bases = [
    join(LOCAL, 'Google', 'Chrome', 'User Data'),
    join(LOCAL, 'Microsoft', 'Edge', 'User Data'),
    join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    join(LOCAL, 'Chromium', 'User Data'),
    join(LOCAL, 'Vivaldi', 'User Data'),
    join(ROAMING, 'Opera Software', 'Opera Stable'),
  ]
  const profiles = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4', 'Guest Profile', 'System Profile']
  const subdirectories = [
    'Cache',
    'Code Cache',
    'GPUCache',
    'ShaderCache',
    'GrShaderCache',
    join('Service Worker', 'CacheStorage'),
    join('DawnCache', 'Data'),
  ]
  const roots = []
  for (const base of bases) {
    for (const profile of profiles) {
      for (const sub of subdirectories) roots.push({ dir: join(base, profile, sub) })
    }
  }
  return roots
}

function linuxBrowserRoots() {
  return []
}

/**
 * The whitelist. Nothing outside these roots is ever touched: a category resolves to
 * absolute directories (or one explicit file), and the cleaner deletes files strictly
 * inside them. `kind: 'risky'` entries are never picked by automatic cleaning.
 */
export function categories() {
  const browserRoots = process.platform === 'win32' ? browserCacheRoots : linuxBrowserRoots
  return [
    {
      id: 'user-temp',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 1,
      roots: () => [{ dir: os.tmpdir() }],
    },
    {
      id: 'win-temp',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 1,
      roots: () => [{ dir: join(WINDIR, 'Temp') }],
    },
    {
      id: 'recycle-bin',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 0,
      roots: () => [{ dir: 'C:\\$Recycle.Bin' }],
    },
    {
      id: 'browser-cache',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 1,
      roots: browserRoots,
    },
    {
      id: 'crash-dumps',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 0,
      roots: () => [
        { dir: join(LOCAL, 'CrashDumps') },
        { dir: join(WINDIR, 'Minidump') },
        { file: join(WINDIR, 'MEMORY.DMP') },
        { dir: join(WINDIR, 'LiveKernelReports') },
      ],
    },
    {
      id: 'thumbnail-cache',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 0,
      roots: () => [
        {
          dir: join(LOCAL, 'Microsoft', 'Windows', 'Explorer'),
          pattern: /^(thumbcache|iconcache)_.*\.db$/i,
        },
      ],
    },
    {
      id: 'wer',
      kind: 'safe',
      requiresAdmin: false,
      minAgeHours: 0,
      roots: () => [
        { dir: join(LOCAL, 'Microsoft', 'Windows', 'WER') },
        { dir: join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER') },
      ],
    },
    {
      id: 'dev-cache',
      kind: 'system',
      requiresAdmin: false,
      minAgeHours: 0,
      roots: () => [
        { dir: join(LOCAL, 'npm-cache') },
        { dir: join(ROAMING, 'npm-cache') },
        { dir: join(LOCAL, 'Yarn', 'Cache') },
        { dir: join(LOCAL, 'pnpm', 'store') },
      ],
    },
    {
      id: 'update-cache',
      kind: 'system',
      requiresAdmin: true,
      minAgeHours: 0,
      roots: () => [{ dir: join(WINDIR, 'SoftwareDistribution', 'Download') }],
    },
    {
      id: 'delivery-optimization',
      kind: 'system',
      requiresAdmin: true,
      minAgeHours: 0,
      roots: () => [
        {
          dir: join(
            WINDIR,
            'ServiceProfiles',
            'NetworkService',
            'AppData',
            'Local',
            'Microsoft',
            'Windows',
            'DeliveryOptimization',
            'Cache',
          ),
        },
      ],
    },
    {
      id: 'prefetch',
      kind: 'system',
      requiresAdmin: true,
      minAgeHours: 0,
      roots: () => [{ dir: join(WINDIR, 'Prefetch') }],
    },
    {
      id: 'windows-old',
      kind: 'risky',
      requiresAdmin: true,
      minAgeHours: 0,
      roots: () => [{ dir: 'C:\\Windows.old' }],
    },
  ]
}

export function categoryById(id) {
  return categories().find((category) => category.id === id) ?? null
}

/** Resolve a category's roots once, so scan and clean see exactly the same list. */
export function resolvedRoots(category) {
  try {
    return category.roots().filter((root) => root && (typeof root.dir === 'string' || typeof root.file === 'string'))
  } catch {
    return []
  }
}
