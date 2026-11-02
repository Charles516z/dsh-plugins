import { promises as fsp } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { resolvedRoots } from './targets.js'
import { walkRoots } from './walk.js'

/** True when `target` is the root file itself or lives strictly inside the root directory. */
function insideRoot(target, root) {
  if (typeof root.file === 'string') return target === root.file
  if (typeof root.dir !== 'string') return false
  const rel = relative(root.dir, target)
  if (rel === '') return false
  if (rel.startsWith('..')) return false
  if (isAbsolute(rel)) return false
  return true
}

/**
 * Delete the files of one category. Only files, only inside the whitelisted roots, only
 * older than the category's minimum age. Busy/permission-denied files are counted and
 * skipped — this never stops a clean halfway.
 */
export async function cleanCategory(category, options = {}) {
  const minAgeHours = Number(options.minAgeHours ?? category.minAgeHours ?? 0)
  const cutoff = minAgeHours > 0 ? Date.now() - minAgeHours * 3_600_000 : 0
  const roots = resolvedRoots(category)
  const result = {
    id: category.id,
    freedBytes: 0,
    deletedFiles: 0,
    skippedRecent: 0,
    busy: 0,
    errors: 0,
    truncated: false,
    elapsedMs: 0,
  }
  if (roots.length === 0) return result

  const stats = await walkRoots(roots, {
    maxFiles: 300000,
    maxMs: 180000,
    onFile: async (pathname, stat, root) => {
      if (!insideRoot(pathname, root)) return
      if (cutoff > 0 && stat.mtimeMs > cutoff) {
        result.skippedRecent += 1
        return
      }
      try {
        await fsp.unlink(pathname)
        result.deletedFiles += 1
        result.freedBytes += stat.size
      } catch (error) {
        const code = error?.code
        if (code === 'ENOENT') return
        if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') result.busy += 1
        else result.errors += 1
      }
    },
  })
  result.errors += stats.errors
  result.truncated = stats.truncated
  result.elapsedMs = stats.elapsedMs
  return result
}
