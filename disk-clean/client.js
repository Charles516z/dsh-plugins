window.__ModuleLoader__.load({
  id: '@local/disk-clean',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'disk-clean'
    const API = '/disk-clean'

    const ZH = {
      title: 'C 盘清理',
      subtitle: '扫描临时文件、浏览器缓存、回收站和崩溃转储，只删除缓存类文件；文档、下载和程序目录不会被改动。',
      free: '可用',
      used: '已用',
      total: '总计',
      scan: '扫描垃圾',
      scope: '清理范围',
      lastScan: '上次扫描',
      scanning: '正在扫描',
      cleaning: '正在清理',
      clean: '清理选中',
      cleanConfirm: '确认删除',
      cancel: '取消',
      selectedBytes: '选中项目可清理',
      nothing: '暂无可清理内容',
      needScan: '先扫描一次，看看能释放多少空间',
      needSelect: '至少选中一项',
      admin: '需管理员',
      missing: '此电脑上不存在',
      readonly: '没有写入权限',
      autoTitle: '自动清理',
      autoHint: '按下面的时间自动清理勾选的缓存类项目；正在使用和最近修改的文件会跳过。',
      scheduleHint: '由 Windows 计划任务按上面的时间执行；到点时没开机，会在下次开机后尽快补跑。',
      tasksOn: 'Windows 计划任务已注册：Harness 没开也会清理。',
      tasksOff: 'Windows 计划任务未注册：目前只在 Harness 运行时清理。',
      weekdaysAt: '工作日（周一至周五）',
      weekendAt: '周末（周六、周日）',
      guardTitle: '空间不足时也自动清理',
      guardHint: '可用空间低于阈值时，按检查间隔清理一次。',
      shortcut: '在桌面创建快捷方式',
      shortcutDone: '已创建：桌面「清理C盘」',
      autoOn: '已开启',
      autoOff: '已关闭',
      threshold: '可用空间低于（GB）',
      interval: '检查间隔（分钟）',
      save: '保存设置',
      saved: '已保存',
      history: '清理记录',
      noHistory: '还没有清理记录。手动或自动清理后，这里会显示释放的空间。',
      freed: '释放',
      lastClean: '上次清理',
      never: '从未清理',
      error: '出错了',
      retry: '重试',
      jobBusy: '已有扫描或清理任务在运行，请稍候',
      files: '个文件',
      truncated: '文件太多，扫描提前结束，数字是下限',
      triggerSchedule: '定时',
      triggerGuard: '空间不足',
      triggerShortcut: '快捷方式',
      triggerAuto: '自动',
      triggerManual: '手动',
      triggerTool: '助手',
      refreshHint: '每 2 秒自动刷新',
      'cat.user-temp.name': '用户临时文件',
      'cat.user-temp.desc': '当前用户和程序的临时文件（%TEMP%）',
      'cat.win-temp.name': '系统临时文件',
      'cat.win-temp.desc': 'C:\\Windows\\Temp 下的临时文件',
      'cat.recycle-bin.name': '回收站',
      'cat.recycle-bin.desc': '已删除但仍占用空间的文件',
      'cat.browser-cache.name': '浏览器缓存',
      'cat.browser-cache.desc': 'Chrome / Edge / Brave 等浏览器的网页缓存',
      'cat.crash-dumps.name': '崩溃转储',
      'cat.crash-dumps.desc': '程序崩溃时写下的内存转储文件',
      'cat.thumbnail-cache.name': '缩略图缓存',
      'cat.thumbnail-cache.desc': '资源管理器生成的缩略图与图标缓存',
      'cat.wer.name': 'Windows 错误报告',
      'cat.wer.desc': '错误报告队列和归档',
      'cat.dev-cache.name': '开发工具缓存',
      'cat.dev-cache.desc': 'npm / Yarn / pnpm 的下载缓存',
      'cat.update-cache.name': 'Windows 更新缓存',
      'cat.update-cache.desc': '已下载的系统更新安装包（建议关闭）',
      'cat.delivery-optimization.name': '传递优化缓存',
      'cat.delivery-optimization.desc': '更新分发的点对点缓存',
      'cat.prefetch.name': '预读取缓存',
      'cat.prefetch.desc': '开机预读取数据，删除后前几次启动稍慢',
      'cat.windows-old.name': '旧系统备份 (Windows.old)',
      'cat.windows-old.desc': '升级前的旧系统，删除后无法回退',
    }

    const EN = {
      title: 'C: drive cleanup',
      subtitle:
        'Scans temp files, browser caches, the recycle bin and crash dumps; only cache files are deleted. Documents, downloads and program folders are never touched.',
      free: 'free',
      used: 'used',
      total: 'total',
      scan: 'Scan for junk',
      scope: 'What gets cleaned',
      lastScan: 'Last scan',
      scanning: 'Scanning',
      cleaning: 'Cleaning',
      clean: 'Clean selected',
      cleanConfirm: 'Delete now',
      cancel: 'Cancel',
      selectedBytes: 'Selected to clean',
      nothing: 'Nothing to clean',
      needScan: 'Scan once to see how much space can come back',
      needSelect: 'Select at least one item',
      admin: 'needs admin',
      missing: 'not on this PC',
      readonly: 'not writable',
      autoTitle: 'Automatic cleaning',
      autoHint: 'Cleans the checked cache categories at the times below. Files in use and recently modified files are skipped.',
      scheduleHint: 'Runs through Windows Task Scheduler at the times above; a slot missed while the PC was off catches up after the next boot.',
      tasksOn: 'Windows scheduled task registered: cleaning runs even when Harness is closed.',
      tasksOff: 'Windows scheduled task not registered: cleaning runs only while Harness is running.',
      weekdaysAt: 'Weekdays (Mon–Fri)',
      weekendAt: 'Weekend (Sat–Sun)',
      guardTitle: 'Also clean when space runs low',
      guardHint: 'Clean once per interval while free space stays below the threshold.',
      shortcut: 'Create desktop shortcut',
      shortcutDone: 'Created: "清理C盘" on your desktop',
      autoOn: 'On',
      autoOff: 'Off',
      threshold: 'Free space below (GB)',
      interval: 'Check every (minutes)',
      save: 'Save settings',
      saved: 'Saved',
      history: 'Cleanup history',
      noHistory: 'No cleanup yet. Manual or automatic runs will show the freed space here.',
      freed: 'freed',
      lastClean: 'Last cleanup',
      never: 'never',
      error: 'Something went wrong',
      retry: 'Retry',
      jobBusy: 'A scan or clean is already running; try again shortly',
      files: 'files',
      truncated: 'Too many files; the scan stopped early and the number is a lower bound',
      triggerSchedule: 'scheduled',
      triggerGuard: 'low space',
      triggerShortcut: 'shortcut',
      triggerAuto: 'automatic',
      triggerManual: 'manual',
      triggerTool: 'agent',
      refreshHint: 'Refreshes every 2 seconds',
      'cat.user-temp.name': 'User temp files',
      'cat.user-temp.desc': 'Temporary files of the current user and running programs (%TEMP%)',
      'cat.win-temp.name': 'System temp files',
      'cat.win-temp.desc': 'Temporary files under C:\\Windows\\Temp',
      'cat.recycle-bin.name': 'Recycle bin',
      'cat.recycle-bin.desc': 'Deleted files that still take up space',
      'cat.browser-cache.name': 'Browser caches',
      'cat.browser-cache.desc': 'Web caches of Chrome / Edge / Brave and friends',
      'cat.crash-dumps.name': 'Crash dumps',
      'cat.crash-dumps.desc': 'Memory dumps written when a program crashed',
      'cat.thumbnail-cache.name': 'Thumbnail cache',
      'cat.thumbnail-cache.desc': 'Thumbnail and icon caches rebuilt by Explorer',
      'cat.wer.name': 'Windows Error Reporting',
      'cat.wer.desc': 'Queued and archived error reports',
      'cat.dev-cache.name': 'Developer caches',
      'cat.dev-cache.desc': 'npm / Yarn / pnpm download caches',
      'cat.update-cache.name': 'Windows Update cache',
      'cat.update-cache.desc': 'Downloaded update packages (keep off unless needed)',
      'cat.delivery-optimization.name': 'Delivery Optimization cache',
      'cat.delivery-optimization.desc': 'Peer-to-peer cache used to distribute updates',
      'cat.prefetch.name': 'Prefetch data',
      'cat.prefetch.desc': 'Boot prefetch data; the next few starts feel slower',
      'cat.windows-old.name': 'Previous Windows (Windows.old)',
      'cat.windows-old.desc': 'The old system after an upgrade; removing it ends the rollback',
    }

    const CSS = `
      .dc-root { display:flex; flex-direction:column; gap:14px; padding:2px 0 48px; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; }
      .dc-card { border:1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2)); background:var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; }
      .dc-row { display:flex; align-items:center; gap:10px; }
      .dc-between { justify-content:space-between; }
      .dc-title { font-size:15px; font-weight:600; }
      .dc-sub { color:var(--dsw-alias-label-secondary); font-size:12px; }
      .dc-muted { color:var(--dsw-alias-label-tertiary); font-size:12px; }
      .dc-bar { position:relative; height:8px; border-radius:999px; background:var(--dsw-alias-fill-l2, var(--dsw-alias-bg-layer-3)); overflow:hidden; }
      .dc-bar-fill { position:absolute; inset:0 auto 0 0; border-radius:999px; background:var(--dsw-alias-brand-primary); }
      .dc-bar-fill.warn { background:var(--dsw-alias-state-warn-primary); }
      .dc-btn { appearance:none; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-fill-l1); color:var(--dsw-alias-label-primary); border-radius:8px; padding:6px 12px; font-size:12px; cursor:pointer; font-family:inherit; }
      .dc-btn:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); }
      .dc-btn:disabled { opacity:.5; cursor:default; }
      .dc-btn.primary { background:var(--dsw-alias-button-primary-fill); border-color:transparent; color:var(--dsw-alias-label-primary-inverted, #fff); }
      .dc-btn.primary:hover:not(:disabled) { background:var(--dsw-alias-button-primary-hover); }
      .dc-btn.danger { background:var(--dsw-alias-state-error-primary); border-color:transparent; color:#fff; }
      .dc-btn.small { padding:3px 8px; font-size:11px; }
      .dc-cat { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-top:1px solid var(--dsw-alias-separator-primary); }
      .dc-cat:first-of-type { border-top:0; }
      .dc-cat input { margin-top:3px; accent-color:var(--dsw-alias-brand-primary); }
      .dc-cat-main { flex:1; min-width:0; }
      .dc-cat-name { font-size:13px; }
      .dc-cat-desc { color:var(--dsw-alias-label-tertiary); font-size:11px; }
      .dc-size { font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-secondary); white-space:nowrap; }
      .dc-badge { display:inline-block; margin-left:6px; padding:0 6px; border-radius:999px; font-size:10px; line-height:16px; border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-tertiary); }
      .dc-badge.warn { color:var(--dsw-alias-state-warn-primary); border-color:var(--dsw-alias-state-warn-secondary, var(--dsw-alias-border-l2)); }
      .dc-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:120px; }
      .dc-field label { color:var(--dsw-alias-label-secondary); font-size:11px; }
      .dc-input { background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); border-radius:8px; padding:6px 8px; font-size:12px; font-family:inherit; }
      .dc-input:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
      .dc-switch { width:36px; height:20px; border-radius:999px; border:0; padding:0; position:relative; cursor:pointer; background:var(--dsw-alias-fill-l2); }
      .dc-switch.on { background:var(--dsw-alias-brand-primary); }
      .dc-switch span { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .15s ease; }
      .dc-switch.on span { left:18px; }
      .dc-error { border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-bg-layer-1); border-radius:8px; padding:8px 10px; font-size:12px; }
      .dc-hist { display:flex; justify-content:space-between; gap:8px; padding:4px 0; border-top:1px solid var(--dsw-alias-separator-primary); font-size:12px; }
      .dc-hist:first-of-type { border-top:0; }
      .dc-progress { color:var(--dsw-alias-label-secondary); font-size:12px; }
      .dc-spin { display:inline-block; width:10px; height:10px; margin-right:6px; border-radius:50%; border:2px solid var(--dsw-alias-border-l2); border-top-color:var(--dsw-alias-brand-primary); animation:dc-spin .8s linear infinite; vertical-align:-1px; }
      @keyframes dc-spin { to { transform:rotate(360deg); } }
      .dc-hint-line { color:var(--dsw-alias-label-tertiary); font-size:11px; }
      .dc-link { color:var(--dsw-alias-link, var(--dsw-alias-brand-primary)); cursor:pointer; background:none; border:0; padding:0; font:inherit; }
    `

    let stylesInjected = false
    function ensureStyles() {
      if (stylesInjected || typeof document === 'undefined') return
      stylesInjected = true
      const element = document.createElement('style')
      element.setAttribute('data-disk-clean', '')
      element.textContent = CSS
      document.head.appendChild(element)
    }

    function fmtBytes(bytes) {
      const value = Number(bytes) || 0
      if (value <= 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let size = value
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
      }
      const digits = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2
      return `${size.toFixed(digits)} ${units[unit]}`
    }

    function fmtTime(at) {
      try {
        return new Date(at).toLocaleString()
      } catch {
        return String(at)
      }
    }

    function makeTranslate(locale) {
      const active = (() => {
        try {
          const snapshot = locale?.getLocale?.()
          return String(snapshot?.active ?? '')
        } catch {
          return ''
        }
      })()
      const fallback = /^en/i.test(active) ? EN : ZH
      return function translate(key) {
        try {
          if (locale && typeof locale.bind === 'function') {
            const text = locale.bind(NS)(key)
            if (typeof text === 'string' && text !== key) return text
          }
        } catch {
          // fall through to the built-in dictionaries
        }
        return fallback[key] ?? ZH[key] ?? key
      }
    }

    async function postJson(path, body) {
      const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-disk-clean': '1' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(body ?? {}),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      return payload
    }

    function Categories(props) {
      const { t, rows, sizes, selected, onToggle, disabled } = props
      return h(
        'div',
        null,
        rows.map((row) => {
          const size = sizes[row.id]
          const checked = selected.includes(row.id)
          const unavailable = !row.exists
          return h(
            'div',
            { className: 'dc-cat', key: row.id },
            h('input', {
              type: 'checkbox',
              checked,
              disabled: disabled || unavailable,
              onChange: () => onToggle(row.id),
              'aria-label': t(`cat.${row.id}.name`),
            }),
            h(
              'div',
              { className: 'dc-cat-main' },
              h(
                'div',
                { className: 'dc-cat-name' },
                t(`cat.${row.id}.name`),
                row.requiresAdmin ? h('span', { className: 'dc-badge' }, t('admin')) : null,
                row.kind === 'risky' ? h('span', { className: 'dc-badge warn' }, '!') : null,
                unavailable ? h('span', { className: 'dc-badge' }, t('missing')) : null,
                !unavailable && !row.writable ? h('span', { className: 'dc-badge' }, t('readonly')) : null,
              ),
              h('div', { className: 'dc-cat-desc' }, t(`cat.${row.id}.desc`)),
            ),
            h(
              'div',
              { className: 'dc-size' },
              size ? `${fmtBytes(size.bytes)} · ${size.files} ${t('files')}` : unavailable ? '—' : '—',
            ),
          )
        }),
      )
    }

    function Section() {
      const [snapshot, setSnapshot] = React.useState(null)
      const [error, setError] = React.useState('')
      const [selected, setSelected] = React.useState(null)
      const [confirming, setConfirming] = React.useState(false)
      const [threshold, setThreshold] = React.useState('')
      const [interval, setIntervalValue] = React.useState('')
      const [weekdaysAt, setWeekdaysAt] = React.useState('')
      const [weekendAt, setWeekendAt] = React.useState('')
      const [guardOn, setGuardOn] = React.useState(false)
      const [savedAt, setSavedAt] = React.useState(0)
      const [shortcutPath, setShortcutPath] = React.useState('')
      const [shortcutBusy, setShortcutBusy] = React.useState(false)
      const [tick, setTick] = React.useState(0)
      const localeRef = React.useRef(appContext ? appContext.get('locale') : null)

      React.useEffect(() => {
        ensureStyles()
        let alive = true
        let locale = appContext ? appContext.get('locale') : null
        localeRef.current = locale
        if (locale && typeof locale.subscribe === 'function') {
          const dispose = locale.subscribe(() => {
            if (alive) setTick((value) => value + 1)
          })
          return () => {
            alive = false
            try {
              dispose()
            } catch {
              // already disposed
            }
          }
        }
        return () => {
          alive = false
        }
      }, [])

      React.useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const response = await fetch(`${API}/state`, { cache: 'no-store', credentials: 'same-origin' })
            const payload = await response.json()
            if (!alive) return
            if (payload && payload.ok === false) {
              setError(String(payload.error ?? 'request failed'))
              return
            }
            setSnapshot(payload)
            setError('')
          } catch (failure) {
            if (alive) setError(String(failure?.message ?? failure))
          }
        }
        void load()
        const timer = setInterval(load, 2000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])

      const t = React.useMemo(() => makeTranslate(localeRef.current), [tick, snapshot?.now])

      React.useEffect(() => {
        if (!snapshot || selected !== null) return
        setSelected(snapshot.categories.filter((row) => row.enabled).map((row) => row.id))
      }, [snapshot, selected])

      React.useEffect(() => {
        if (!snapshot || threshold !== '') return
        const config = snapshot.config
        setThreshold(String(config.guard.thresholdGb))
        setIntervalValue(String(config.guard.checkIntervalMin))
        setGuardOn(config.guard.enabled === true)
        setWeekdaysAt(config.schedule.weekdaysAt || '')
        setWeekendAt(config.schedule.weekendAt || '')
      }, [snapshot, threshold])

      const categories = snapshot?.categories ?? []
      const sizes = {}
      for (const entry of snapshot?.scan?.categories ?? []) sizes[entry.id] = entry
      const job = snapshot?.job
      const running = job?.running === true
      const chosen = selected ?? []
      const selectedBytes = chosen.reduce((total, id) => total + (sizes[id]?.bytes ?? 0), 0)
      const disk = snapshot?.disk
      const usedPercent = disk && disk.available ? Math.min(100, (disk.usedBytes / disk.totalBytes) * 100) : 0

      const toggle = (id) => {
        const next = chosen.includes(id) ? chosen.filter((entry) => entry !== id) : [...chosen, id]
        setSelected(next)
        const map = {}
        for (const row of categories) map[row.id] = next.includes(row.id)
        void postJson('/config', { categories: map }).catch(() => {})
      }

      const saveAuto = async () => {
        setError('')
        try {
          await postJson('/config', {
            schedule: { weekdaysAt: weekdaysAt.trim(), weekendAt: weekendAt.trim() },
            guard: { enabled: guardOn, thresholdGb: Number(threshold), checkIntervalMin: Number(interval) },
          })
          setSavedAt(Date.now())
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        }
      }

      const makeShortcut = async () => {
        setError('')
        setShortcutBusy(true)
        try {
          const result = await postJson('/shortcut', {})
          if (result.ok === false) setError(String(result.error))
          else setShortcutPath(String(result.path ?? ''))
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setShortcutBusy(false)
        }
      }

      const runScan = async () => {
        setError('')
        setConfirming(false)
        try {
          const result = await postJson('/scan', { categories: chosen })
          if (result.ok === false) setError(result.error === 'busy' ? t('jobBusy') : String(result.error))
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        }
      }

      const runClean = async () => {
        setError('')
        try {
          const result = await postJson('/clean', { categories: chosen })
          if (result.ok === false) setError(result.error === 'busy' ? t('jobBusy') : String(result.error))
          else setConfirming(false)
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        }
      }

      const toggleAuto = async () => {
        if (!snapshot) return
        setError('')
        try {
          await postJson('/config', { enabled: !snapshot.config.enabled })
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        }
      }

      const autoOn = snapshot?.config?.enabled === true
      const triggerName = (trigger) => {
        const keys = {
          schedule: 'triggerSchedule',
          guard: 'triggerGuard',
          shortcut: 'triggerShortcut',
          tool: 'triggerTool',
          manual: 'triggerManual',
          auto: 'triggerAuto',
        }
        return t(keys[trigger] ?? 'triggerManual')
      }

      return h(
        'div',
        { className: 'dc-root' },
        error ? h('div', { className: 'dc-error' }, `${t('error')}: ${error}`) : null,

        h(
          'div',
          { className: 'dc-card' },
          h(
            'div',
            { className: 'dc-row dc-between' },
            h(
              'div',
              null,
              h('div', { className: 'dc-title' }, t('title')),
              h('div', { className: 'dc-sub' }, t('subtitle')),
            ),
          ),
          disk && disk.available
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                h(
                  'div',
                  { className: 'dc-row dc-between' },
                  h(
                    'div',
                    { className: 'dc-size' },
                    `${t('free')} ${fmtBytes(disk.freeBytes)} / ${t('total')} ${fmtBytes(disk.totalBytes)}`,
                  ),
                  h('div', { className: 'dc-muted' }, `${formatPercent(usedPercent)} ${t('used')}`),
                ),
                h(
                  'div',
                  { className: 'dc-bar' },
                  h('div', {
                    className: `dc-bar-fill${autoOn && snapshot?.config?.guard?.enabled === true && disk.freeBytes < (snapshot?.config?.guard?.thresholdGb ?? 8) * 1024 ** 3 ? ' warn' : ''}`,
                    style: { width: `${Math.max(2, usedPercent)}%` },
                  }),
                ),
              )
            : h('div', { className: 'dc-muted' }, '—'),
          h(
            'div',
            { className: 'dc-row' },
            h('button', { className: 'dc-btn primary', onClick: runScan, disabled: running || chosen.length === 0 }, t('scan')),
            confirming
              ? h('button', { className: 'dc-btn', onClick: () => setConfirming(false), disabled: running }, t('cancel'))
              : null,
            confirming
              ? h(
                  'button',
                  { className: 'dc-btn danger', onClick: runClean, disabled: running },
                  `${t('cleanConfirm')} · ${fmtBytes(selectedBytes)}`,
                )
              : h(
                  'button',
                  { className: 'dc-btn danger', onClick: () => setConfirming(true), disabled: running || chosen.length === 0 },
                  `${t('clean')} · ${fmtBytes(selectedBytes)}`,
                ),
            running
              ? h(
                  'div',
                  { className: 'dc-progress' },
                  h('span', { className: 'dc-spin' }),
                  job?.kind === 'scan' ? t('scanning') : t('cleaning'),
                  job?.progress?.current ? ` · ${t(`cat.${job.progress.current}.name`)}` : '',
                )
              : null,
          ),
          h(
            'div',
            { className: 'dc-hint-line' },
            `${t('selectedBytes')}: ${fmtBytes(selectedBytes)}`,
            snapshot?.scan ? ` · ${t('lastScan')}: ${snapshot.scan.at ? fmtTime(snapshot.scan.at) : '—'}` : ` · ${t('needScan')}`,
          ),
          snapshot?.scan?.truncated ? h('div', { className: 'dc-muted' }, t('truncated')) : null,
        ),

        h(
          'div',
          { className: 'dc-card' },
          h('div', { className: 'dc-title' }, t('scope')),
          h(Categories, { t, rows: categories, sizes, selected: chosen, onToggle: toggle, disabled: running }),
        ),

        h(
          'div',
          { className: 'dc-card' },
          h(
            'div',
            { className: 'dc-row dc-between' },
            h('div', { className: 'dc-title' }, t('autoTitle')),
            h(
              'div',
              { className: 'dc-row' },
              h('div', { className: 'dc-muted' }, autoOn ? t('autoOn') : t('autoOff')),
              h(
                'button',
                { className: `dc-switch${autoOn ? ' on' : ''}`, onClick: toggleAuto, 'aria-pressed': autoOn },
                h('span', null),
              ),
            ),
          ),
          h('div', { className: 'dc-sub' }, t('autoHint')),
          h(
            'div',
            { className: 'dc-row' },
            h(
              'div',
              { className: 'dc-field', style: { flex: 1 } },
              h('label', null, t('weekdaysAt')),
              h('input', {
                className: 'dc-input',
                type: 'time',
                value: weekdaysAt,
                onChange: (event) => setWeekdaysAt(event.target.value),
              }),
            ),
            h(
              'div',
              { className: 'dc-field', style: { flex: 1 } },
              h('label', null, t('weekendAt')),
              h('input', {
                className: 'dc-input',
                type: 'time',
                value: weekendAt,
                onChange: (event) => setWeekendAt(event.target.value),
              }),
            ),
          ),
          h('div', { className: 'dc-muted' }, t('scheduleHint')),
          h('div', { className: 'dc-muted' }, t(snapshot?.tasks?.ok ? 'tasksOn' : 'tasksOff')),
          h(
            'div',
            { className: 'dc-row dc-between', style: { marginTop: '6px' } },
            h(
              'div',
              null,
              h('div', { className: 'dc-sub', style: { margin: '0' } }, t('guardTitle')),
              h('div', { className: 'dc-muted' }, t('guardHint')),
            ),
            h(
              'button',
              { className: `dc-switch${guardOn ? ' on' : ''}`, onClick: () => setGuardOn(!guardOn), 'aria-pressed': guardOn },
              h('span', null),
            ),
          ),
          guardOn
            ? h(
                'div',
                { className: 'dc-row' },
                h(
                  'div',
                  { className: 'dc-field' },
                  h('label', null, t('threshold')),
                  h('input', {
                    className: 'dc-input',
                    type: 'number',
                    min: '0.5',
                    step: '0.5',
                    value: threshold,
                    onChange: (event) => setThreshold(event.target.value),
                  }),
                ),
                h(
                  'div',
                  { className: 'dc-field' },
                  h('label', null, t('interval')),
                  h('input', {
                    className: 'dc-input',
                    type: 'number',
                    min: '5',
                    step: '5',
                    value: interval,
                    onChange: (event) => setIntervalValue(event.target.value),
                  }),
                ),
              )
            : null,
          h(
            'div',
            { className: 'dc-row' },
            h('button', { className: 'dc-btn primary', onClick: saveAuto }, t('save')),
            savedAt > 0 && Date.now() - savedAt < 4000 ? h('div', { className: 'dc-muted' }, t('saved')) : null,
            h('button', { className: 'dc-btn', onClick: makeShortcut, disabled: shortcutBusy }, shortcutBusy ? '…' : t('shortcut')),
            h('div', { className: 'dc-muted' }, autoOn ? `${t('autoOn')} · ${t('refreshHint')}` : t('autoOff')),
          ),
          shortcutPath
            ? h('div', { className: 'dc-muted', title: shortcutPath }, `${t('shortcutDone')} · ${shortcutPath}`)
            : null,
        ),

        h(
          'div',
          { className: 'dc-card' },
          h(
            'div',
            { className: 'dc-row dc-between' },
            h('div', { className: 'dc-title' }, t('history')),
            h(
              'div',
              { className: 'dc-muted' },
              snapshot?.lastClean
                ? `${t('lastClean')}: ${fmtTime(snapshot.lastClean.at)}`
                : t('never'),
            ),
          ),
          (snapshot?.history ?? []).length === 0
            ? h('div', { className: 'dc-muted' }, t('noHistory'))
            : (snapshot?.history ?? []).map((entry) =>
                h(
                  'div',
                  { className: 'dc-hist', key: entry.at },
                  h('div', null, `${fmtTime(entry.at)} · ${triggerName(entry.trigger)}`),
                  h('div', { className: 'dc-size' }, `${entry.deletedFiles} ${t('files')} · ${t('freed')} ${fmtBytes(entry.freedBytes)}`),
                ),
              ),
        ),
      )
    }

    function formatPercent(value) {
      return `${Number(value).toFixed(1)}%`
    }

    let appContext = null

    return {
      inject: ['slots'],
      apply(ctx) {
        appContext = ctx
        ensureStyles()
        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          try {
            locale.register(NS, 'zh', ZH)
            locale.register(NS, 'en', EN)
          } catch {
            // a locale service that refuses runtime dictionaries falls back to our own copies
          }
        }
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'disk-clean',
              order: 60,
              label: () => makeTranslate(appContext ? appContext.get('locale') : null)('title'),
            },
            Section,
          ),
        )
      },
    }
  },
})
