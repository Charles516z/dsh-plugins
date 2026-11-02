import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

const DIRECTORY_CONCURRENCY = 8

/**
 * Walk the whitelisted roots of one category.
 *
 * - Symlinks/junctions are counted and never followed, so a link inside a cache folder
 *   cannot pull the walk (or the deletion) somewhere else.
 * - `maxFiles`/`maxMs` keep one pathological folder from freezing the host: the walk stops
 *   and reports `truncated` instead.
 * - `onFile(path, stats, root)` decides what to do with a file; scan counts it, clean may
 *   unlink it. Directories are never removed.
 */
export async function walkRoots(roots, options = {}) {
  const stats = {
    files: 0,
    bytes: 0,
    errors: 0,
    skippedLinks: 0,
    truncated: false,
    elapsedMs: 0,
  }
  const maxFiles = options.maxFiles ?? 250000
  const maxMs = options.maxMs ?? 120000
  const startedAt = Date.now()
  let active = 0
  const waiters = []

  async function acquire() {
    if (active < DIRECTORY_CONCURRENCY) {
      active += 1
      return
    }
    await new Promise((resolve) => waiters.push(resolve))
  }

  function release() {
    const next = waiters.shift()
    if (next) next()
    else active -= 1
  }

  function shouldStop() {
    return stats.files >= maxFiles || Date.now() - startedAt > maxMs
  }

  async function visitFile(pathname, root) {
    let stat
    try {
      stat = await fsp.lstat(pathname)
    } catch {
      stats.errors += 1
      return
    }
    if (!stat.isFile()) return
    stats.files += 1
    stats.bytes += stat.size
    if (typeof options.onFile === 'function') {
      try {
        await options.onFile(pathname, stat, root, stats)
      } catch {
        stats.errors += 1
      }
    }
  }

  async function walkDirectory(pathname, root) {
    const subdirectories = []
    await acquire()
    try {
      let entries
      try {
        entries = await fsp.readdir(pathname, { withFileTypes: true })
      } catch (error) {
        if (error?.code !== 'ENOENT') stats.errors += 1
        return
      }
      for (const entry of entries) {
        if (shouldStop()) {
          stats.truncated = true
          break
        }
        const child = join(pathname, entry.name)
        if (entry.isSymbolicLink()) {
          stats.skippedLinks += 1
          continue
        }
        if (entry.isDirectory()) {
          // One lstat per directory: a junction is not a symlink on every Windows build,
          // so confirm the type before descending.
          try {
            const stat = await fsp.lstat(child)
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
              stats.skippedLinks += 1
              continue
            }
          } catch {
            stats.errors += 1
            continue
          }
          subdirectories.push(child)
          continue
        }
        if (entry.isFile()) await visitFile(child, root)
      }
    } finally {
      // Release before descending: a parent that keeps its slot while waiting for children
      // deadlocks once every slot is held by a parent.
      release()
    }
    await Promise.all(subdirectories.map((directory) => walkDirectory(directory, root)))
  }

  for (const root of roots) {
    if (shouldStop()) {
      stats.truncated = true
      break
    }
    if (typeof root.file === 'string') {
      await visitFile(root.file, root)
      continue
    }
    if (typeof root.dir !== 'string') continue
    if (root.pattern instanceof RegExp) {
      // A shallow root: only the files directly inside it that match the pattern.
      let entries
      try {
        entries = await fsp.readdir(root.dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!root.pattern.test(entry.name)) continue
        await visitFile(join(root.dir, entry.name), root)
      }
      continue
    }
    try {
      const stat = await fsp.lstat(root.dir)
      if (!stat.isDirectory()) continue
      if (stat.isSymbolicLink()) {
        stats.skippedLinks += 1
        continue
      }
    } catch {
      continue
    }
    await walkDirectory(root.dir, root)
  }

  stats.elapsedMs = Date.now() - startedAt
  return stats
}
