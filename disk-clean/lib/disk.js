import { accessSync, constants, existsSync, statfsSync } from 'node:fs'
import { resolvedRoots } from './targets.js'

const SYSTEM_ROOT = process.platform === 'win32' ? 'C:\\' : '/'

/**
 * Total/free space of the drive the harness itself lives on. `bavail` is what a normal
 * process may still use, which is the number that decides whether C: is "full".
 */
export function diskInfo(root = SYSTEM_ROOT) {
  const info = { drive: root, totalBytes: 0, freeBytes: 0, usedBytes: 0, available: false }
  try {
    const stats = statfsSync(root)
    const blockSize = Number(stats.bsize)
    const total = Number(stats.blocks) * blockSize
    const free = Number(stats.bavail) * blockSize
    if (Number.isFinite(total) && total > 0) {
      info.totalBytes = total
      info.freeBytes = Math.max(0, Math.min(total, free))
      info.usedBytes = Math.max(0, total - info.freeBytes)
      info.available = true
    }
  } catch {
    // statfs is unavailable on some filesystems; the page then shows the scan data only.
  }
  return info
}

export function canRead(pathname) {
  try {
    accessSync(pathname, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export function canWrite(pathname) {
  try {
    accessSync(pathname, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * What the page shows per category before scanning: does anything exist, and may this
 * process delete there (UAC decides that for the Windows-owned folders).
 */
export function describeCategory(category) {
  const roots = resolvedRoots(category)
  let exists = false
  let writable = false
  for (const root of roots) {
    if (root.dir) {
      if (!existsSync(root.dir)) continue
      exists = true
      if (canWrite(root.dir)) writable = true
    } else if (root.file) {
      if (!existsSync(root.file)) continue
      exists = true
      if (canWrite(root.file)) writable = true
    }
  }
  return { exists, writable }
}
