/**
 * Offline check of the reply-reading path in index.js: a fake Cordis context
 * captures the `session/event` listener, synthetic turn events drive it, and the
 * utterance is played for real through powershell.exe + assets/speak.ps1.
 *
 * Run: node tools/voice-listener-check.mjs
 */
import { apply } from '../dsh-win-pronounce/index.js'

const handlers = new Map()
const ctx = {
  get() {
    return undefined
  },
  on(event, handler) {
    handlers.set(event, handler)
    return () => handlers.delete(event)
  },
  effect(factory) {
    const dispose = factory()
    return typeof dispose === 'function' ? dispose : () => {}
  },
}

apply(ctx)

const handler = handlers.get('session/event')
if (!handler) {
  console.log('FAIL: no session/event listener was registered')
  process.exit(1)
}
console.log('listener registered')

const session = { id: 'check-session', header: {} }
const reply = '自动朗读已经接上了，这一句是从回复里念出来的。'
const markdown = `## 检查\n\n${reply}\n\n\`\`\`js\nconst ignored = 1\n\`\`\`\n\n| 表格 | 不会念 |\n|---|---|\n| 1 | 2 |\n`

handler(session, { type: 'turn/start', data: { turn: 1 } })
handler(session, {
  type: 'assistant/message',
  data: {
    turn: 1,
    step: 1,
    message: {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: markdown },
        { type: 'tool-call', id: 'call_1', name: 'speak', arguments: '{}' },
      ],
    },
    stream: [],
  },
})
handler(session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
console.log('turn/end delivered')

// A turn that ends abnormally must stay silent, and a subagent session too.
handler(session, { type: 'turn/start', data: { turn: 2 } })
handler(session, {
  type: 'assistant/message',
  data: {
    turn: 2,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '这一句不该被念。' }] },
    stream: [],
  },
})
handler(session, { type: 'turn/end', data: { turn: 2, reason: { kind: 'interrupted' } } })
handler({ id: 'sub-session', header: { origin: 'subagent' } }, { type: 'turn/start', data: { turn: 1 } })
handler(
  { id: 'sub-session', header: { origin: 'subagent' } },
  {
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: '子会话不该被念。' }] },
      stream: [],
    },
  },
)
handler(
  { id: 'sub-session', header: { origin: 'subagent' } },
  { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
)
console.log('negative cases delivered')

setTimeout(() => {
  console.log('done')
  process.exit(0)
}, 9000)
