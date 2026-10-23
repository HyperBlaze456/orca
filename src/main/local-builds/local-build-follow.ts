import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const FOLLOW_FILE_NAME = 'local-build-follow.json'
export const LOCAL_BUILD_FOLLOW_POLL_INTERVAL_MS = 30 * 60 * 1000
// Why: the manifest is copied beside 250MB zips; wait for the whole drop to settle before reading it.
const LOCAL_BUILD_FOLLOW_DEBOUNCE_MS = 5_000

function followFilePath(userDataDir: string): string {
  return join(userDataDir, FOLLOW_FILE_NAME)
}

function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined
}

export async function readFollowedLocalBuildManifestPath(
  userDataDir: string
): Promise<string | null> {
  let text: string
  try {
    text = await readFile(followFilePath(userDataDir), 'utf8')
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return null
    }
    throw error
  }
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || !('manifestPath' in parsed)) {
    return null
  }
  const { manifestPath } = parsed
  return typeof manifestPath === 'string' && manifestPath.length > 0 ? manifestPath : null
}

export async function writeFollowedLocalBuildManifestPath(
  userDataDir: string,
  manifestPath: string | null
): Promise<void> {
  const target = followFilePath(userDataDir)
  if (manifestPath === null) {
    await unlink(target).catch((error: unknown) => {
      if (errnoCode(error) !== 'ENOENT') {
        throw error
      }
    })
    return
  }
  await mkdir(userDataDir, { recursive: true })
  await writeFile(target, `${JSON.stringify({ manifestPath }, null, 2)}\n`, 'utf8')
}

export type LocalBuildFollowWatcher = {
  close: () => void
}

/**
 * Calls `onChange` when the manifest is replaced, and on a slow poll in case the directory
 * watch is lost (missing folder, FSEvents hiccup). Timers never keep the process alive.
 */
export function watchFollowedLocalBuildManifest(
  manifestPath: string,
  onChange: () => void,
  options: { debounceMs?: number; pollIntervalMs?: number } = {}
): LocalBuildFollowWatcher {
  const debounceMs = options.debounceMs ?? LOCAL_BUILD_FOLLOW_DEBOUNCE_MS
  const pollIntervalMs = options.pollIntervalMs ?? LOCAL_BUILD_FOLLOW_POLL_INTERVAL_MS
  const manifestName = basename(manifestPath)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const scheduleChange = (): void => {
    if (closed) {
      return
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      onChange()
    }, debounceMs)
    debounceTimer.unref?.()
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(dirname(manifestPath), { persistent: false }, (_event, filename) => {
      if (!filename || basename(String(filename)) === manifestName) {
        scheduleChange()
      }
    })
    // Why: a watcher error (folder removed) must not surface as an uncaught exception; the poll covers it.
    watcher.on('error', () => {
      watcher?.close()
      watcher = null
    })
  } catch {
    watcher = null
  }

  const pollTimer = setInterval(scheduleChange, pollIntervalMs)
  pollTimer.unref?.()

  return {
    close: () => {
      closed = true
      clearInterval(pollTimer)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      watcher?.close()
      watcher = null
    }
  }
}
