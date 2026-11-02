/**
 * Client half of the dsh-win-pronounce bundle.
 *
 * Renders one compact speaker button in the composer tool row, immediately to
 * the right of the permission control, plus the settings popover it opens.
 * Everything it needs from the host half travels over the plugin's own HTTP
 * routes on the same origin.
 */
window.__ModuleLoader__.load({
  id: 'dsh-win-pronounce',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // The popover is positioned fixed; a portal keeps it out of the composer's
    // own stacking context so a clipped or filtered ancestor cannot hide it.
    const createPortal = (() => {
      try {
        const reactDom = require('react-dom')
        const usable =
          typeof reactDom?.createPortal === 'function' && reactDom.version === React.version
        return usable ? reactDom.createPortal : null
      } catch {
        return null
      }
    })()
    const NS = 'dsh-win-pronounce'
    const API = '/dsh-win-pronounce'
    const CSRF_HEADER = 'x-dsh-win-pronounce'
    const PANEL_MIN = 250
    const PANEL_MAX = 300

    const ZH = {
      title: '语音输出',
      buttonOn: '语音输出已开启，点开可以更换音源',
      buttonOff: '语音输出已关闭，点开可以开启',
      stateOn: '已开启 · 助手可以朗读简短内容',
      stateOff: '已关闭 · 助手完全静音',
      speaking: '正在朗读…',
      voice: '音源',
      rate: '语速',
      volume: '音量',
      preview: '试听',
      stop: '停止',
      refresh: '刷新',
      noVoices: '没有找到本地语音',
      engineSapi: 'SAPI 桌面语音',
      engineOneCore: 'OneCore 语音',
      footNote: '只使用这台电脑上已安装的 Windows 语音，不联网。',
      error: '出错了',
    }

    const EN = {
      title: 'Voice output',
      buttonOn: 'Voice output is on — open to pick another voice',
      buttonOff: 'Voice output is off — open to switch it on',
      stateOn: 'On · the assistant may read short lines aloud',
      stateOff: 'Off · the assistant stays silent',
      speaking: 'Speaking…',
      voice: 'Voice',
      rate: 'Speed',
      volume: 'Volume',
      preview: 'Preview',
      stop: 'Stop',
      refresh: 'Refresh',
      noVoices: 'No local voice found',
      engineSapi: 'SAPI desktop voices',
      engineOneCore: 'OneCore voices',
      footNote: 'Only voices installed on this PC are used; nothing leaves the machine.',
      error: 'Something went wrong',
    }

    const CSS = `
      .vs-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; transition:background .15s ease, color .15s ease; flex:0 0 auto; }
      .vs-btn:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
      .vs-btn:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
      .vs-btn-on { color:var(--dsw-alias-brand-primary); }
      .vs-btn-on:hover { color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-fill-l2); }
      .vs-ico { width:18px; height:18px; display:block; }
      .vs-panel { position:fixed; z-index:2147483000; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; padding:12px; border-radius:14px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); box-shadow:0 14px 40px rgba(0,0,0,.22); font-size:12.5px; line-height:1.45; animation:vs-pop-in .12s ease-out; }
      @keyframes vs-pop-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
      .vs-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .vs-title { font-size:13px; font-weight:600; }
      .vs-state { color:var(--dsw-alias-label-tertiary); font-size:11.5px; }
      .vs-state-on { color:var(--dsw-alias-brand-primary); }
      .vs-switch { position:relative; width:34px; height:19px; padding:0; border:0; border-radius:999px; background:var(--dsw-alias-fill-l2); cursor:pointer; transition:background .15s ease; flex:0 0 auto; }
      .vs-switch-on { background:var(--dsw-alias-brand-primary); }
      .vs-switch:disabled { opacity:.5; cursor:default; }
      .vs-knob { position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25); transition:transform .15s ease; display:block; }
      .vs-switch-on .vs-knob { transform:translateX(15px); }
      .vs-row { display:flex; align-items:center; gap:8px; }
      .vs-label { color:var(--dsw-alias-label-secondary); font-size:11.5px; flex:0 0 32px; }
      .vs-select { flex:1 1 auto; min-width:0; height:30px; padding:0 6px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-size:12px; }
      .vs-range { flex:1 1 auto; min-width:0; accent-color:var(--dsw-alias-brand-primary); }
      .vs-value { flex:0 0 42px; text-align:right; color:var(--dsw-alias-label-tertiary); font-size:11.5px; font-variant-numeric:tabular-nums; }
      .vs-foot { display:flex; gap:6px; }
      .vs-action { flex:1 1 0; height:28px; padding:0 8px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-fill-l1); color:var(--dsw-alias-label-primary); font-size:11.5px; cursor:pointer; }
      .vs-action:hover:enabled { background:var(--dsw-alias-interactive-bg-hover); }
      .vs-action:disabled { opacity:.45; cursor:default; }
      .vs-error { color:var(--dsw-alias-state-error-primary); font-size:11.5px; margin:0; word-break:break-word; }
      .vs-note { color:var(--dsw-alias-label-tertiary); font-size:11px; margin:0; }
    `

    let stylesInjected = false
    function ensureStyles() {
      if (stylesInjected || typeof document === 'undefined') return
      stylesInjected = true
      const element = document.createElement('style')
      element.setAttribute('data-dsh-win-pronounce', '')
      element.textContent = CSS
      document.head.appendChild(element)
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

    function langLabel(lang) {
      const value = String(lang ?? '')
      if (/^zh/i.test(value)) return '中文'
      if (/^en/i.test(value)) return 'English'
      if (/^ja/i.test(value)) return '日本語'
      return value
    }

    function voiceLabel(voice) {
      const language = langLabel(voice?.lang)
      const name = String(voice?.name ?? '')
      return language ? `${name} · ${language}` : name
    }

    function SpeakerIcon(props) {
      const active = props.active === true
      const common = {
        className: 'vs-ico',
        width: 18,
        height: 18,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }
      return h(
        'svg',
        common,
        h('path', { key: 'body', d: 'M11.2 4.8 6.6 8.7H3.4v6.6h3.2l4.6 3.9z' }),
        active
          ? h('path', { key: 'wave-1', d: 'M15.1 8.6a4.7 4.7 0 0 1 0 6.8' })
          : null,
        active
          ? h('path', { key: 'wave-2', d: 'M17.8 6a8.6 8.6 0 0 1 0 12' })
          : h('path', { key: 'mute', d: 'M16 9.4l4 5.2M20 9.4l-4 5.2' }),
      )
    }

    function VoiceControl() {
      const [open, setOpen] = React.useState(false)
      const [snapshot, setSnapshot] = React.useState(null)
      const [actionError, setActionError] = React.useState('')
      const [engineError, setEngineError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [rate, setRate] = React.useState(1)
      const [volume, setVolume] = React.useState(1)
      const [position, setPosition] = React.useState(null)
      const [tick, setTick] = React.useState(0)

      const buttonRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const saveTimerRef = React.useRef(0)
      const localeRef = React.useRef(appContext ? appContext.get('locale') : null)

      const t = React.useMemo(() => makeTranslate(localeRef.current), [tick])

      React.useEffect(() => {
        ensureStyles()
        let alive = true
        const locale = appContext ? appContext.get('locale') : null
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

      const applySnapshot = React.useCallback((payload) => {
        if (!payload || typeof payload !== 'object') return
        setSnapshot(payload)
        if (saveTimerRef.current === 0) {
          if (typeof payload.rate === 'number') setRate(payload.rate)
          if (typeof payload.volume === 'number') setVolume(payload.volume)
        }
      }, [])

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(`${API}/state`, { credentials: 'same-origin', cache: 'no-store' })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error ?? `HTTP ${response.status}`))
          }
          applySnapshot(payload)
          setEngineError(typeof payload?.voiceError === 'string' ? payload.voiceError : '')
        } catch (failure) {
          setEngineError(String(failure?.message ?? failure))
        }
      }, [applySnapshot])

      const act = React.useCallback(
        async (path, body) => {
          setBusy(true)
          setActionError('')
          try {
            const response = await fetch(`${API}${path}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', [CSRF_HEADER]: '1' },
              credentials: 'same-origin',
              cache: 'no-store',
              body: JSON.stringify(body ?? {}),
            })
            const payload = await response.json().catch(() => ({}))
            if (payload && Array.isArray(payload.voices)) applySnapshot(payload)
            if (typeof payload?.error === 'string' && payload.error !== '') setActionError(payload.error)
            if (!response.ok) throw new Error(String(payload?.error ?? `HTTP ${response.status}`))
            return payload
          } catch (failure) {
            setActionError(String(failure?.message ?? failure))
            return null
          } finally {
            setBusy(false)
          }
        },
        [applySnapshot],
      )

      React.useEffect(() => {
        void load()
      }, [load])

      React.useEffect(() => {
        if (!open) return undefined
        void load()
        const timer = setInterval(() => {
          void load()
        }, 2500)
        return () => clearInterval(timer)
      }, [open, load])

      const place = React.useCallback(() => {
        const element = buttonRef.current
        if (!element || typeof window === 'undefined') return
        const rect = element.getBoundingClientRect()
        const width = Math.min(PANEL_MAX, Math.max(PANEL_MIN, window.innerWidth - 16))
        const left = Math.min(Math.max(8, rect.left - 6), Math.max(8, window.innerWidth - width - 8))
        const bottom = Math.max(8, window.innerHeight - rect.top + 10)
        setPosition({ left, bottom, width })
      }, [])

      React.useEffect(() => {
        if (!open) return undefined
        place()
        const onResize = () => place()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [open, place])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (panelRef.current && panelRef.current.contains(target)) return
          if (buttonRef.current && buttonRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          }
        }
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open])

      React.useEffect(
        () => () => {
          if (saveTimerRef.current !== 0) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = 0
          }
        },
        [],
      )

      const enabled = snapshot?.enabled === true
      const speaking = snapshot?.speaking === true
      const voices = Array.isArray(snapshot?.voices) ? snapshot.voices : []

      const toggleEnabled = () => {
        const next = !enabled
        setSnapshot((current) => (current ? { ...current, enabled: next } : current))
        void act('/config', { enabled: next }).then((payload) => {
          if (!payload) void load()
        })
      }

      const chooseVoice = (value) => {
        if (!value) return
        setSnapshot((current) => (current ? { ...current, voice: value } : current))
        void act('/config', { voice: value })
      }

      const commitLevels = (nextRate, nextVolume) => {
        if (saveTimerRef.current !== 0) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = 0
          void act('/config', { rate: nextRate, volume: nextVolume })
        }, 220)
      }

      const groups = []
      for (const voice of voices) {
        const engine = voice.engine === 'onecore' ? 'onecore' : 'sapi'
        let group = groups.find((entry) => entry.engine === engine)
        if (!group) {
          group = { engine, items: [] }
          groups.push(group)
        }
        group.items.push(voice)
      }

      const label = enabled ? t('buttonOn') : t('buttonOff')
      const message = actionError || engineError

      const button = h(
        'button',
        {
          key: 'button',
          ref: buttonRef,
          type: 'button',
          className: 'vs-btn' + (enabled ? ' vs-btn-on' : ''),
          title: label,
          'aria-label': label,
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          onClick: () => {
            if (!open) place()
            setOpen((value) => !value)
          },
        },
        h(SpeakerIcon, { active: enabled }),
      )

      const panelNode =
        open && position
          ? h(
              'div',
              {
                key: 'panel',
                ref: panelRef,
                className: 'vs-panel',
                role: 'dialog',
                'aria-label': t('title'),
                style: {
                  left: `${Math.round(position.left)}px`,
                  bottom: `${Math.round(position.bottom)}px`,
                  width: `${Math.round(position.width)}px`,
                },
              },
              h(
                'div',
                { className: 'vs-head' },
                h(
                  'div',
                  null,
                  h('div', { className: 'vs-title' }, t('title')),
                  h(
                    'div',
                    { className: 'vs-state' + (enabled ? ' vs-state-on' : '') },
                    speaking ? t('speaking') : enabled ? t('stateOn') : t('stateOff'),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'switch',
                    'aria-checked': enabled,
                    'aria-label': t('title'),
                    className: 'vs-switch' + (enabled ? ' vs-switch-on' : ''),
                    disabled: busy,
                    onClick: toggleEnabled,
                  },
                  h('span', { className: 'vs-knob' }),
                ),
              ),
              h(
                'div',
                { className: 'vs-row' },
                h('span', { className: 'vs-label' }, t('voice')),
                h(
                  'select',
                  {
                    className: 'vs-select',
                    value: snapshot?.voice ?? '',
                    disabled: busy || voices.length === 0,
                    'aria-label': t('voice'),
                    onChange: (event) => chooseVoice(event.target.value),
                  },
                  voices.length === 0 ? h('option', { value: '' }, t('noVoices')) : null,
                  groups.map((group) =>
                    h(
                      'optgroup',
                      {
                        key: group.engine,
                        label: group.engine === 'onecore' ? t('engineOneCore') : t('engineSapi'),
                      },
                      group.items.map((voice) =>
                        h('option', { key: voice.id, value: voice.id }, voiceLabel(voice)),
                      ),
                    ),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'vs-row' },
                h('span', { className: 'vs-label' }, t('rate')),
                h('input', {
                  className: 'vs-range',
                  type: 'range',
                  min: '0.6',
                  max: '1.8',
                  step: '0.05',
                  value: rate,
                  'aria-label': t('rate'),
                  onChange: (event) => {
                    const next = Number(event.target.value)
                    setRate(next)
                    commitLevels(next, volume)
                  },
                }),
                h('span', { className: 'vs-value' }, `${Number(rate).toFixed(2)}×`),
              ),
              h(
                'div',
                { className: 'vs-row' },
                h('span', { className: 'vs-label' }, t('volume')),
                h('input', {
                  className: 'vs-range',
                  type: 'range',
                  min: '0',
                  max: '1',
                  step: '0.05',
                  value: volume,
                  'aria-label': t('volume'),
                  onChange: (event) => {
                    const next = Number(event.target.value)
                    setVolume(next)
                    commitLevels(rate, next)
                  },
                }),
                h('span', { className: 'vs-value' }, `${Math.round(Number(volume) * 100)}%`),
              ),
              h(
                'div',
                { className: 'vs-foot' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'vs-action',
                    disabled: busy || voices.length === 0,
                    onClick: () => void act('/preview'),
                  },
                  t('preview'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'vs-action',
                    disabled: busy || !speaking,
                    onClick: () => void act('/stop'),
                  },
                  t('stop'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'vs-action',
                    disabled: busy,
                    onClick: () => void act('/refresh'),
                  },
                  t('refresh'),
                ),
              ),
              message ? h('p', { className: 'vs-error' }, message) : null,
              h('p', { className: 'vs-note' }, t('footNote')),
            )
          : null

      const host = typeof document === 'undefined' ? null : document.body
      let panel = panelNode
      if (panelNode && createPortal && host) {
        try {
          panel = createPortal(panelNode, host)
        } catch {
          panel = panelNode
        }
      }

      return h(React.Fragment, null, button, panel)
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
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'dsh-win-pronounce',
              order: 10,
              label: () => makeTranslate(appContext ? appContext.get('locale') : null)('title'),
            },
            VoiceControl,
          ),
        )
      },
    }
  },
})
