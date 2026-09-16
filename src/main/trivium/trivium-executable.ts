import { isAbsolute } from 'node:path'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'
import { findExecutableOnPath, isExecutableFile } from '../startup/path-executable-lookup'
import { resolvePathEnvKey } from '../pty/windows-path-segment-merge'

export type TriviumExecutableResolution =
  | { ok: true; program: string }
  | { ok: false; reason: 'not-found' | 'hydration-failed'; detail: string }

/** Absolute-path override for a trivium that is not on any PATH we can probe. */
export const TRIVIUM_EXECUTABLE_ENV_VAR = 'TRIVIUM_EXECUTABLE'

// Why a uv tool install: it drops `trivium` (or `trivium.exe`) into the user's
// local bin, which a GUI-launched Electron never inherits — hence the shell probe.
function executableCandidateNames(): readonly string[] {
  return process.platform === 'win32' ? ['trivium.exe', 'trivium.cmd', 'trivium.bat'] : ['trivium']
}

function lookUpOnCurrentPath(): string | null {
  const pathValue = process.env[resolvePathEnvKey(process.env, process.platform)]
  for (const name of executableCandidateNames()) {
    const found = findExecutableOnPath(name, pathValue)
    if (found) {
      return found
    }
  }
  return null
}

function resolveOverride(override: string): TriviumExecutableResolution {
  if (!isAbsolute(override)) {
    return {
      ok: false,
      reason: 'not-found',
      detail: `${TRIVIUM_EXECUTABLE_ENV_VAR} must be an absolute path, got "${override}"`
    }
  }
  if (!isExecutableFile(override)) {
    return {
      ok: false,
      reason: 'not-found',
      detail: `${TRIVIUM_EXECUTABLE_ENV_VAR} does not name an executable file: ${override}`
    }
  }
  return { ok: true, program: override }
}

async function resolveUncached(): Promise<TriviumExecutableResolution> {
  const override = process.env[TRIVIUM_EXECUTABLE_ENV_VAR]?.trim()
  if (override) {
    return resolveOverride(override)
  }
  const onLaunchPath = lookUpOnCurrentPath()
  if (onLaunchPath) {
    return { ok: true, program: onLaunchPath }
  }
  const hydration = await hydrateShellPath()
  if (!hydration.ok) {
    return {
      ok: false,
      reason: 'hydration-failed',
      detail: `trivium is not on Orca's PATH and the login shell could not be probed (${hydration.failureReason})`
    }
  }
  mergePathSegments(hydration.segments)
  const onShellPath = lookUpOnCurrentPath()
  if (onShellPath) {
    return { ok: true, program: onShellPath }
  }
  return {
    ok: false,
    reason: 'not-found',
    detail: `trivium was not found on the login shell PATH; set ${TRIVIUM_EXECUTABLE_ENV_VAR} to an absolute path`
  }
}

let cached: Promise<TriviumExecutableResolution> | null = null

/**
 * Absolute path to the `trivium` CLI. Cached for the process lifetime because
 * the miss path spawns a profile-loading shell, which costs seconds.
 */
export function resolveTriviumExecutable(): Promise<TriviumExecutableResolution> {
  if (!cached) {
    // Why not cache the rejection: a failed probe must not poison every later call.
    cached = resolveUncached().catch((error: unknown) => {
      cached = null
      return {
        ok: false as const,
        reason: 'hydration-failed' as const,
        detail: error instanceof Error ? error.message : String(error)
      }
    })
  }
  return cached
}

/** @internal - tests need a clean lookup cache between cases. */
export function _resetTriviumExecutableForTests(): void {
  cached = null
}
