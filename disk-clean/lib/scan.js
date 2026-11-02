import { resolvedRoots } from './targets.js'
import { walkRoots } from './walk.js'

/**
 * Measure one category. Files newer than `minAgeHours` are not counted, so the number the
 * page shows is exactly what a clean right now would remove.
 */
export async function scanCategory(category, options = {}) {
  const minAgeHours = Number(options.minAgeHours ?? category.minAgeHours ?? 0)
  const cutoff = minAgeHours > 0 ? Date.now() - minAgeHours * 3_600_000 : 0
  const roots = resolvedRoots(category)
  const result = {
    id: category.id,
    bytes: 0,
    files: 0,
    newestAt: 0,
    errors: 0,
    skippedLinks: 0,
    truncated: false,
    elapsedMs: 0,
    empty: roots.length === 0,
  }
  if (roots.length === 0) return result

  const stats = await walkRoots(roots, {
    maxFiles: 250000,
    maxMs: 90000,
    onFile: (pathname, stat) => {
      if (cutoff > 0 && stat.mtimeMs > cutoff) return
      result.bytes += stat.size
      result.files += 1
      if (stat.mtimeMs > result.newestAt) result.newestAt = stat.mtimeMs
    },
  })
  result.errors = stats.errors
  result.skippedLinks = stats.skippedLinks
  result.truncated = stats.truncated
  result.elapsedMs = stats.elapsedMs
  return result
}
