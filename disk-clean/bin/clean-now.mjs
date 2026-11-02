// Headless cleanup for the desktop shortcut. It runs when Harness is closed, using the same
// category list, safety rules and state file as the plugin so history stays consistent.
import { cleanCategory } from '../lib/clean.js'
import { categories } from '../lib/targets.js'
import { loadState, saveState } from '../lib/state.js'
import { fmtBytes } from '../lib/util.js'

const scheduled = process.argv.includes('--scheduled')
const state = loadState()
const picked = categories().filter(
  (category) => category.kind !== 'risky' && state.config.categories[category.id] === true,
)
if (picked.length === 0) {
  console.log('没有启用任何清理项，请先在 Harness 的「设置 → C 盘清理」里勾选。')
  process.exit(0)
}

const results = []
for (const category of picked) {
  const configured = state.config.minAgeHours[category.id]
  const minAgeHours = Number.isFinite(configured) ? configured : category.minAgeHours
  const result = await cleanCategory(category, { minAgeHours })
  results.push(result)
  console.log(`- ${category.id}: ${fmtBytes(result.freedBytes)}，${result.deletedFiles} 个文件`)
}

const sum = (key) => results.reduce((total, result) => total + (Number(result[key]) || 0), 0)
const entry = {
  at: Date.now(),
  trigger: scheduled ? 'schedule' : 'shortcut',
  freedBytes: sum('freedBytes'),
  deletedFiles: sum('deletedFiles'),
  busy: sum('busy'),
  errors: sum('errors'),
  truncated: results.some((result) => result.truncated),
  categories: results.map((result) => ({
    id: result.id,
    freedBytes: result.freedBytes,
    deletedFiles: result.deletedFiles,
  })),
}

state.lastClean = entry
state.lastScan = null
if (entry.freedBytes > 0 || entry.deletedFiles > 0) state.history = [entry, ...state.history].slice(0, 20)
saveState(state)

console.log(`清理完成：释放 ${fmtBytes(entry.freedBytes)}，删除 ${entry.deletedFiles} 个文件。`)
if (entry.busy > 0) console.log(`跳过 ${entry.busy} 个正在使用的文件。`)
if (entry.errors > 0) console.log(`${entry.errors} 个文件因权限不足未删除。`)
