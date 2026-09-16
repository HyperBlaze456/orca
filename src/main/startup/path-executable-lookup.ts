import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

export function isExecutableFile(candidate: string): boolean {
  try {
    if (!existsSync(candidate)) {
      return false
    }
    accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Absolute path to `command` on `pathValue`, or null when no entry holds it. */
export function findExecutableOnPath(
  command: string,
  pathValue: string | undefined
): string | null {
  for (const directory of pathValue?.split(delimiter) ?? []) {
    // Why: empty and relative PATH entries resolve against a cwd we do not control, which is the hijack we are avoiding.
    if (!directory || !isAbsolute(directory)) {
      continue
    }
    const candidate = join(directory, command)
    if (isExecutableFile(candidate)) {
      return candidate
    }
  }
  return null
}
