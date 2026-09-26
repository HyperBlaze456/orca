const STORAGE_PREFIX = 'orca-trivium-page-v1'

/** One key per workspace and harness root; each page store appends its own suffix. */
export function triviumPageStorageKey(workspaceId: string, harnessRoot: string | null): string {
  return `${STORAGE_PREFIX}:${workspaceId}:${harnessRoot ?? ''}`
}

/** The stored JSON value, or null when absent, unreadable or storage is unavailable. */
export function readTriviumPageStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeTriviumPageStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is optional: without it markers and expansion simply do not persist.
  }
}
