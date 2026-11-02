import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanCategory } from './lib/clean.js'
import { describeCategory, diskInfo } from './lib/disk.js'
import { scanCategory } from './lib/scan.js'
import { categories, categoryById } from './lib/targets.js'
import { loadState, normalizeConfig, saveState } from './lib/state.js'
import { dueSchedule } from './lib/schedule.js'
import { fmtBytes, profileDirectory } from './lib/util.js'

export const name = 'disk-clean'
export const inject = ['webServer']

const ROUTE_PREFIX = '/disk-clean'
const CSRF_HEADER = 'x-dsh-disk-clean'
const BODY_LIMIT = 64 * 1024

const CATEGORY_NAMES = {
  'user-temp': '用户临时文件',
  'win-temp': '系统临时文件',
  'recycle-bin': '回收站',
  'browser-cache': '浏览器缓存',
  'crash-dumps': '崩溃转储',
  'thumbnail-cache': '缩略图缓存',
  wer: 'Windows 错误报告',
  'dev-cache': '开发工具缓存',
  'update-cache': 'Windows 更新缓存',
  'delivery-optimization': '传递优化缓存',
  prefetch: '预读取缓存',
  'windows-old': '旧系统备份 (Windows.old)',
}

const TRIGGER_NAMES = {
  schedule: '定时清理',
  guard: '空间不足清理',
  shortcut: '桌面快捷方式',
  auto: '自动清理',
  manual: '手动清理',
  tool: '助手清理',
}

const SHORTCUT_NAME = '清理C盘.lnk'
const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))

const CLEAN_NOW_PS1 = `param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
$origin = '@@ORIGIN@@'
$cli = '@@CLI@@'
$source = if ($Quiet) { 'schedule' } else { 'shortcut' }
function Show-Result([string]$text) {
  if ($env:DSH_DISK_CLEAN_SILENT -eq '1') { Write-Output $text; return }
  if ($Quiet) {
    # A scheduled run must stay invisible; keep a small log next to this script instead.
    try { Add-Content -Path (Join-Path $PSScriptRoot 'clean.log') -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $text) -Encoding UTF8 } catch { }
    return
  }
  [System.Windows.MessageBox]::Show($text, 'C 盘清理', 'OK', 'Information') | Out-Null
}
$online = $true
try {
  $headers = @{ 'x-dsh-disk-clean' = '1'; 'x-dsh-disk-clean-source' = $source }
  $started = Invoke-RestMethod -Method Post -Uri ($origin + '/disk-clean/clean') -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 15
} catch {
  $online = $false
}
if ($online) {
  if ($started.ok -eq $false) {
    if ($started.error -eq 'busy') { Show-Result '已经有一个扫描或清理任务在运行，请稍后。' }
    else { Show-Result ('没有开始清理：' + $started.error) }
    exit
  }
  $deadline = (Get-Date).AddMinutes(5)
  $state = $null
  do {
    Start-Sleep -Milliseconds 800
    try { $state = Invoke-RestMethod -Uri ($origin + '/disk-clean/state') -TimeoutSec 10 } catch { break }
  } while ($state.job.running -and (Get-Date) -lt $deadline)
  if ($state -and $state.job.running) {
    Show-Result '清理仍在后台进行，可以打开 Harness 的「C 盘清理」页查看结果。'
    exit
  }
  $last = $state.lastClean
  if (-not $last) { Show-Result '清理完成，没有需要删除的文件。'; exit }
  $mb = [math]::Round($last.freedBytes / 1MB, 1)
  $text = '清理完成：释放 ' + $mb + ' MB，删除 ' + $last.deletedFiles + ' 个文件。'
  if ($last.busy -gt 0) { $text = $text + [Environment]::NewLine + '跳过 ' + $last.busy + ' 个正在使用的文件。' }
  Show-Result $text
  exit
}
$command = Get-Command node -ErrorAction SilentlyContinue
if (-not $command) {
  Show-Result 'Harness 当前没有运行，也没有找到 Node.js。请先打开 Harness，再从「设置 → C 盘清理」里清理。'
  exit
}
try {
  # A scheduled task runs the same script; tell the CLI so history says "定时清理".
  $cliArgs = @()
  if ($Quiet) { $cliArgs += '--scheduled' }
  $output = & $command.Source $cli @cliArgs 2>&1 | Out-String
  Show-Result ('Harness 未运行，已直接执行清理。' + [Environment]::NewLine + [Environment]::NewLine + $output.Trim())
} catch {
  Show-Result ('清理失败：' + $_.Exception.Message)
}
`

const CLEAN_NOW_VBS = `Option Explicit
Dim shell, ps1, cmd, mode
Set shell = CreateObject("WScript.Shell")
ps1 = "@@PS1@@"
mode = ""
If WScript.Arguments.Count > 0 Then mode = " " & WScript.Arguments(0)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """" & mode
shell.Run cmd, 0, False
`

const CREATE_SHORTCUT_PS1 = `$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop) { throw 'desktop folder not found' }
$shell = New-Object -ComObject WScript.Shell
$path = Join-Path $desktop '@@NAME@@'
$shortcut = $shell.CreateShortcut($path)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\\wscript.exe'
$shortcut.Arguments = [char]34 + '@@VBS@@' + [char]34
$shortcut.WorkingDirectory = '@@DIR@@'
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\\cleanmgr.exe') + ',0'
$shortcut.Description = '立即清理 C 盘临时文件与缓存'
$shortcut.Save()
Write-Output $path
`

function categoryName(id) {
  return CATEGORY_NAMES[id] ?? id
}

function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return
  let body
  try {
    body = JSON.stringify(payload)
  } catch {
    body = '{"ok":false,"error":"unserializable"}'
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readJsonBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => finish(new Error('request body timed out')), 10000)
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        finish(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size === 0) {
        finish(null, {})
        return
      }
      try {
        finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        finish(new Error('invalid json body'))
      }
    })
    req.on('error', (error) => finish(error))
  })
}

/** A cross-site page cannot set a custom header without a CORS preflight, which is never granted. */
function sameOriginRequest(req) {
  if (req.headers[CSRF_HEADER] !== '1') return false
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function totalOf(entries, key) {
  let total = 0
  for (const entry of entries) total += Number(entry?.[key]) || 0
  return total
}

export function apply(ctx) {
  const state = loadState()
  let job = null
  let lastGuardAt = 0

  const log = (message) => {
    try {
      console.warn(`[disk-clean] ${message}`)
    } catch {
      // console is best effort
    }
  }

  function publicJob() {
    if (!job) return null
    return {
      kind: job.kind,
      running: job.running,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt ?? null,
      error: job.error ?? null,
      progress: job.progress ?? null,
      result: job.running ? null : job.result ?? null,
    }
  }

  function selectIds(requested) {
    const known = new Set(categories().map((category) => category.id))
    const list = Array.isArray(requested) ? requested.filter((id) => typeof id === 'string' && known.has(id)) : []
    if (list.length > 0) return list
    return categories()
      .filter((category) => state.config.categories[category.id] === true)
      .map((category) => category.id)
  }

  function pickedCategories(ids) {
    const picked = []
    for (const id of ids) {
      const category = categoryById(id)
      if (category) picked.push(category)
    }
    return picked
  }

  function minAgeFor(category, override) {
    const value = Number.isFinite(override) ? override : state.config.minAgeHours[category.id]
    return Number.isFinite(value) ? value : category.minAgeHours
  }

  async function performScan(ids, onProgress) {
    const picked = pickedCategories(ids)
    const results = []
    for (const category of picked) {
      onProgress?.({ current: category.id, index: results.length, total: picked.length })
      results.push(await scanCategory(category, { minAgeHours: minAgeFor(category) }))
    }
    const summary = {
      at: Date.now(),
      bytes: totalOf(results, 'bytes'),
      files: totalOf(results, 'files'),
      truncated: results.some((entry) => entry.truncated),
      categories: results,
    }
    state.lastScan = summary
    saveState(state)
    return summary
  }

  async function performClean(ids, options = {}) {
    const picked = pickedCategories(ids)
    const results = []
    for (const category of picked) {
      job.progress = {
        current: category.id,
        index: results.length,
        total: picked.length,
        freedBytes: totalOf(results, 'freedBytes'),
      }
      results.push(
        await cleanCategory(category, {
          minAgeHours: minAgeFor(category, options.minAgeHours),
        }),
      )
    }
    const freedBytes = totalOf(results, 'freedBytes')
    const deletedFiles = totalOf(results, 'deletedFiles')
    const entry = {
      at: Date.now(),
      trigger: options.trigger ?? 'manual',
      freedBytes,
      deletedFiles,
      busy: totalOf(results, 'busy'),
      errors: totalOf(results, 'errors'),
      truncated: results.some((result) => result.truncated),
      categories: results.map((result) => ({
        id: result.id,
        freedBytes: result.freedBytes,
        deletedFiles: result.deletedFiles,
      })),
    }
    state.lastClean = entry
    // The scan numbers described the files that were just removed; keeping them on the page
    // would show space that is already free.
    state.lastScan = null
    // A run that found nothing worth deleting is not history; it would fill the list with zero rows.
    if (freedBytes > 0 || deletedFiles > 0) state.history = [entry, ...state.history].slice(0, 20)
    saveState(state)
    return entry
  }

  function startJob(kind, runner) {
    if (job?.running) return false
    const started = { kind, running: true, startedAt: Date.now(), progress: { current: '', index: 0, total: 0 } }
    job = started
    void (async () => {
      try {
        started.result = await runner()
      } catch (error) {
        started.error = String(error?.message ?? error)
        log(`${kind} failed: ${started.error}`)
      } finally {
        started.running = false
        started.finishedAt = Date.now()
        started.progress = null
      }
    })()
    return true
  }

  function buildSnapshot() {
    const config = state.config
    const disk = diskInfo()
    const list = categories().map((category) => {
      const status = describeCategory(category)
      return {
        id: category.id,
        kind: category.kind,
        requiresAdmin: category.requiresAdmin,
        defaultMinAgeHours: category.minAgeHours,
        minAgeHours: config.minAgeHours[category.id] ?? category.minAgeHours,
        enabled: config.categories[category.id] === true,
        exists: status.exists,
        writable: status.writable,
      }
    })
    return {
      ok: true,
      now: Date.now(),
      platform: process.platform,
      disk,
      config: {
        enabled: config.enabled,
        schedule: { ...config.schedule },
        guard: { ...config.guard },
      },
      categories: list,
      tasks: taskStatus,
      scan: state.lastScan,
      lastClean: state.lastClean,
      history: state.history.slice(0, 8),
      job: publicJob(),
    }
  }

  function autoCleanIds() {
    return categories()
      .filter((category) => category.kind !== 'risky' && state.config.categories[category.id] === true)
      .map((category) => category.id)
  }

  async function autoTick() {
    const config = state.config
    if (!config.enabled || job?.running) return
    const now = new Date()
    // When Task Scheduler owns the schedule a second in-process run would duplicate it:
    // the Windows task already ran (or will run at the next boot) for today's slot.
    const due = taskStatus.ok ? null : dueSchedule(now, config.schedule, state.lastScheduled)
    if (due) {
      // Claim before cleaning: a crash after deleting must not let a restart clean twice today.
      state.lastScheduled[due.slot] = due.key
      saveState(state)
      // A machine that was off at 21:00 catches up the same evening; a slot missed by more
      // than half a day belongs to the past and must not trigger at an unrelated time.
      if (due.missedMs > 12 * 3_600_000) {
        log(`skipped ${due.slot} slot ${due.clock}; it was missed by more than 12 hours`)
        return
      }
      const ids = autoCleanIds()
      if (ids.length === 0) return
      if (startJob('clean', () => performClean(ids, { trigger: 'schedule' }))) {
        log(`scheduled clean started (${due.slot} ${due.clock})`)
      }
      return
    }

    const guard = config.guard
    if (!guard.enabled) return
    if (Date.now() - lastGuardAt < Math.max(5, guard.checkIntervalMin) * 60_000) return
    const disk = diskInfo()
    if (!disk.available || disk.freeBytes > guard.thresholdGb * 1024 ** 3) return
    lastGuardAt = Date.now()
    const ids = autoCleanIds()
    if (ids.length === 0) return
    if (startJob('clean', () => performClean(ids, { trigger: 'guard' }))) {
      log(`free space below ${guard.thresholdGb} GB, guard clean started`)
    }
  }

  // ---- desktop shortcut ---------------------------------------------------------------

  function psQuote(value) {
    return String(value).replace(/'/g, "''")
  }

  function runPowerShell(script) {
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30_000, encoding: 'utf8' },
    )
  }

  const TASK_WEEKDAY = 'DSH-DiskClean-Weekdays'
  const TASK_WEEKEND = 'DSH-DiskClean-Weekend'

  let taskStatus = { ok: false, at: 0, detail: 'not-synced' }

  function ensureLauncherFiles() {
    const server = ctx.get('webServer')
    const origin = server && typeof server.getOrigin === 'function' ? server.getOrigin() : ''
    if (!origin) return null
    const launcherDir = join(profileDirectory(), '.disk-clean')
    mkdirSync(launcherDir, { recursive: true })
    const ps1Path = join(launcherDir, 'clean-now.ps1')
    const vbsPath = join(launcherDir, 'clean-now.vbs')
    const cliPath = join(PACKAGE_ROOT, 'bin', 'clean-now.mjs')
    // Windows PowerShell 5.1 reads .ps1 as ANSI without a BOM, and wscript rejects UTF-8
    // scripts: the launcher files must carry a BOM (UTF-8 for ps1, UTF-16LE for vbs).
    writeFileSync(
      ps1Path,
      `\ufeff${CLEAN_NOW_PS1.replaceAll('@@ORIGIN@@', psQuote(origin)).replaceAll('@@CLI@@', psQuote(cliPath))}`,
      'utf8',
    )
    writeFileSync(vbsPath, Buffer.from(`\ufeff${CLEAN_NOW_VBS.replaceAll('@@PS1@@', ps1Path)}`, 'utf16le'))
    return { launcherDir, ps1Path, vbsPath }
  }

  function createDesktopShortcut() {
    if (process.platform !== 'win32') return { ok: false, error: 'windows-only' }
    const files = ensureLauncherFiles()
    if (!files) return { ok: false, error: 'origin-unavailable' }
    const script = CREATE_SHORTCUT_PS1.replaceAll('@@NAME@@', psQuote(SHORTCUT_NAME))
      .replaceAll('@@VBS@@', psQuote(files.vbsPath))
      .replaceAll('@@DIR@@', psQuote(files.launcherDir))
    const created = runPowerShell(script).trim()
    log(`desktop shortcut written to ${created}`)
    return { ok: true, path: created }
  }

  // Task Scheduler is the reliable half of "every evening at 21:00": it fires while Harness is
  // closed, and StartWhenAvailable catches up a slot missed while the machine was off. The
  // in-process scheduler stays as a fallback when task registration is refused.
  function syncScheduleTasks() {
    if (process.platform !== 'win32') {
      taskStatus = { ok: false, at: Date.now(), detail: 'windows-only' }
      return taskStatus
    }
    const files = ensureLauncherFiles()
    if (!files) {
      taskStatus = { ok: false, at: Date.now(), detail: 'origin-unavailable' }
      return taskStatus
    }
    const schedule = state.config.enabled ? state.config.schedule : { weekdaysAt: '', weekendAt: '' }
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$vbs = '${psQuote(files.vbsPath)}'`,
      `$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\\wscript.exe') -Argument ('"' + $vbs + '" -Quiet')`,
      '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)',
      'function Sync-DiskCleanTask([string]$name, [string]$time, [string[]]$days) {',
      '  if ([string]::IsNullOrWhiteSpace($time)) {',
      '    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue',
      '    return',
      '  }',
      '  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $time',
      "  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'C 盘清理（disk-clean）' -Force | Out-Null",
      '}',
      `Sync-DiskCleanTask '${TASK_WEEKDAY}' '${psQuote(schedule.weekdaysAt)}' @('Monday','Tuesday','Wednesday','Thursday','Friday')`,
      `Sync-DiskCleanTask '${TASK_WEEKEND}' '${psQuote(schedule.weekendAt)}' @('Saturday','Sunday')`,
      "Write-Output 'ok'",
    ].join('\n')
    try {
      runPowerShell(script)
      const active = state.config.enabled && Boolean(schedule.weekdaysAt || schedule.weekendAt)
      taskStatus = active
        ? { ok: true, at: Date.now(), detail: 'registered', names: [TASK_WEEKDAY, TASK_WEEKEND].filter((name, index) => (index === 0 ? schedule.weekdaysAt : schedule.weekendAt)) }
        : { ok: false, at: Date.now(), detail: 'disabled', names: [] }
    } catch (error) {
      taskStatus = { ok: false, at: Date.now(), detail: String(error?.message ?? error) }
      log(`task scheduler unavailable: ${taskStatus.detail}`)
    }
    return taskStatus
  }

  // ---- routes -------------------------------------------------------------------------

  const routes = [
    {
      path: `${ROUTE_PREFIX}/state`,
      handle: () => buildSnapshot(),
    },
    {
      path: `${ROUTE_PREFIX}/scan`,
      method: 'POST',
      handle: (body) => {
        if (job?.running) return { ok: false, error: 'busy', job: publicJob() }
        const ids = selectIds(body?.categories)
        if (ids.length === 0) return { ok: false, error: 'no-categories' }
        startJob('scan', () => performScan(ids, (progress) => (job.progress = progress)))
        return { ok: true, job: publicJob() }
      },
    },
    {
      path: `${ROUTE_PREFIX}/clean`,
      method: 'POST',
      handle: (body, req) => {
        if (job?.running) return { ok: false, error: 'busy', job: publicJob() }
        const ids = selectIds(body?.categories)
        if (ids.length === 0) return { ok: false, error: 'no-categories' }
        const minAgeHours = Number.isFinite(body?.minAgeHours) ? Number(body.minAgeHours) : undefined
        const source = req?.headers?.['x-dsh-disk-clean-source']
        const trigger = source === 'shortcut' ? 'shortcut' : source === 'schedule' ? 'schedule' : 'manual'
        startJob('clean', () => performClean(ids, { trigger, minAgeHours }))
        return { ok: true, job: publicJob() }
      },
    },
    {
      path: `${ROUTE_PREFIX}/config`,
      method: 'POST',
      handle: (body) => {
        state.config = normalizeConfig(body, state.config)
        saveState(state)
        const tasks = syncScheduleTasks()
        return { ok: true, config: state.config, tasks }
      },
    },
    {
      path: `${ROUTE_PREFIX}/shortcut`,
      method: 'POST',
      handle: () => createDesktopShortcut(),
    },
  ]

  ctx.effect(() => {
    const server = ctx.get('webServer')
    if (!server || typeof server.register !== 'function') {
      log('webServer service is unavailable; the settings page cannot be served')
      return () => {}
    }
    const disposers = []
    for (const route of routes) {
      const dispose = server.register({
        kind: 'exact',
        path: route.path,
        handler: (req, res) => {
          void (async () => {
            try {
              if (route.method && req.method !== route.method) {
                sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
                return
              }
              let body = {}
              if (req.method === 'POST') {
                if (!sameOriginRequest(req)) {
                  sendJson(res, 403, { ok: false, error: 'forbidden' })
                  return
                }
                body = await readJsonBody(req)
              }
              sendJson(res, 200, await route.handle(body, req))
            } catch (error) {
              log(`route ${route.path} failed: ${String(error?.message ?? error)}`)
              sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
            }
          })()
        },
      })
      disposers.push(dispose)
    }
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // already gone
        }
      }
    }
  }, 'disk-clean: http routes')

  // ---- scheduler ----------------------------------------------------------------------

  ctx.effect(() => {
    const first = setTimeout(() => {
      syncScheduleTasks()
      void autoTick()
    }, 15_000)
    first.unref?.()
    const timer = setInterval(() => void autoTick(), 30_000)
    timer.unref?.()
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, 'disk-clean: auto clean scheduler')

  // ---- agent tool ---------------------------------------------------------------------

  function textScan(summary) {
    const lines = [
      `扫描完成：可清理 ${fmtBytes(summary.bytes)}，共 ${summary.files.toLocaleString('en-US')} 个文件（仅统计满足最小保留时间的文件）`,
    ]
    for (const entry of summary.categories) {
      lines.push(`- ${categoryName(entry.id)} (${entry.id})：${fmtBytes(entry.bytes)}，${entry.files.toLocaleString('en-US')} 个文件`)
    }
    if (summary.truncated) lines.push('注意：文件数量过多，扫描提前结束，大小是下限。')
    return lines.join('\n')
  }

  function textClean(entry) {
    const lines = [
      `清理完成：释放 ${fmtBytes(entry.freedBytes)}，删除 ${entry.deletedFiles.toLocaleString('en-US')} 个文件。`,
    ]
    for (const item of entry.categories) lines.push(`- ${categoryName(item.id)} (${item.id})：${fmtBytes(item.freedBytes)}`)
    if (entry.busy > 0) lines.push(`跳过 ${entry.busy} 个正在被使用的文件。`)
    if (entry.errors > 0) lines.push(`${entry.errors} 个文件因权限不足未删除。`)
    if (entry.truncated) lines.push('注意：文件数量过多，本次清理提前结束。')
    return lines.join('\n')
  }

  function textStatus() {
    const disk = diskInfo()
    const config = state.config
    const lines = []
    if (disk.available) {
      const percent = ((disk.freeBytes / disk.totalBytes) * 100).toFixed(1)
      lines.push(`C: 共 ${fmtBytes(disk.totalBytes)}，可用 ${fmtBytes(disk.freeBytes)}（${percent}%），已用 ${fmtBytes(disk.usedBytes)}。`)
    } else {
      lines.push('无法读取 C: 的空间信息。')
    }
    const slots = []
    if (config.schedule.weekdaysAt) slots.push(`工作日 ${config.schedule.weekdaysAt}`)
    if (config.schedule.weekendAt) slots.push(`周末 ${config.schedule.weekendAt}`)
    lines.push(
      config.enabled
        ? `自动清理：开启${slots.length > 0 ? `，${slots.join('、')} 定时清理` : ''}${config.guard.enabled ? `；可用空间低于 ${config.guard.thresholdGb} GB 时也会清理` : ''}（${taskStatus.ok ? 'Windows 计划任务已注册，Harness 关闭也会执行，错过的时点在开机后补跑' : '仅在 Harness 运行时执行'}）。`
        : '自动清理：关闭。',
    )
    if (state.lastClean) {
      lines.push(
        `上次清理：${new Date(state.lastClean.at).toLocaleString('zh-CN')}（${TRIGGER_NAMES[state.lastClean.trigger] ?? state.lastClean.trigger}），释放 ${fmtBytes(state.lastClean.freedBytes)}。`,
      )
    } else {
      lines.push('上次清理：还没有清理记录。')
    }
    const enabled = categories().filter((category) => config.categories[category.id]).map((category) => category.id)
    lines.push(`已启用的清理项：${enabled.join(', ') || '无'}。`)
    return lines.join('\n')
  }

  async function handleTool(args) {
    const action = typeof args?.action === 'string' ? args.action : 'status'
    const requested =
      typeof args?.categories === 'string' && args.categories.trim() !== ''
        ? args.categories
            .split(',')
            .map((part) => part.trim())
            .filter((part) => categoryById(part) !== null)
        : undefined
    const ids = selectIds(requested)
    if (ids.length === 0) return '没有可清理的项目：请先在设置页开启清理类别。'

    if (action === 'status') return textStatus()

    if (job?.running) return '另一个扫描或清理任务正在运行，请稍后再试。'

    if (action === 'scan') {
      const summary = await performScan(ids)
      return textScan(summary)
    }

    if (action === 'clean') {
      const confirm = args?.confirm === true
      const minAgeHours = Number.isFinite(args?.minAgeHours) ? Number(args.minAgeHours) : undefined
      if (!confirm) {
        const summary = await performScan(ids)
        return `${textScan(summary)}\n\n这是预览，没有删除任何文件。确认清理请再次调用并带上 confirm: true。`
      }
      const entry = await performClean(ids, { trigger: 'tool', minAgeHours })
      return textClean(entry)
    }

    return `未知操作：${action}。可用操作：status、scan、clean。`
  }

  ctx.effect(() => {
    const tools = ctx.get('tools')
    if (!tools || typeof tools.register !== 'function') {
      log('tools service is unavailable; the agent tool is not registered')
      return () => {}
    }
    return tools.register({
      name: 'clean_c_disk',
      description:
        'Check C: drive space and clean junk safely (temp files, browser caches, recycle bin, crash dumps). Never touches documents, downloads, or program folders. Without confirm:true a clean is only a preview.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'scan', 'clean'],
            description: 'status: space and settings; scan: measure what can be freed; clean: delete cache files.',
          },
          categories: {
            type: 'string',
            description:
              'Comma separated category ids: user-temp, win-temp, recycle-bin, browser-cache, crash-dumps, thumbnail-cache, wer, dev-cache, update-cache, delivery-optimization, prefetch, windows-old. Omit to use the enabled ones.',
          },
          minAgeHours: {
            type: 'number',
            description: 'Only delete files untouched for at least this many hours. Omit to use each category default.',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to actually delete. Otherwise clean returns a preview only.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
      },
      execute: async (args) => ({ text: await handleTool(args) }),
    })
  }, 'disk-clean: agent tool')

  log(`ready (platform ${process.platform}, auto clean ${state.config.enabled ? 'on' : 'off'})`)
}
