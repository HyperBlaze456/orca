import { resolveTriviumExecutable } from './trivium-executable'
import {
  isTriviumServiceExitError,
  isTriviumServiceTimeoutError,
  openTriviumServiceConnection,
  type TriviumServiceConnection
} from './trivium-service-connection'
import { isTriviumServiceError } from './trivium-service-protocol'

export type TriviumServiceUnavailable = {
  reason: 'executable-missing' | 'hydration-failed' | 'service-unreachable' | 'timeout' | 'backoff'
  detail: string
}

export type TriviumServiceCallResult =
  | { ok: true; result: unknown; program: string; protocol: number; version: string }
  | { ok: false; unavailable: TriviumServiceUnavailable }

export type TriviumServiceSupervisorDependencies = {
  resolveExecutable: typeof resolveTriviumExecutable
  openConnection: typeof openTriviumServiceConnection
}

// Why 1s/2s/4s then a 30s hold: a service that dies on every open would
// otherwise be respawned once per poll, and the panes poll on every file change.
const BACKOFF_MS = [1_000, 2_000, 4_000] as const
const UNAVAILABLE_HOLD_MS = 30_000

const realDependencies: TriviumServiceSupervisorDependencies = {
  resolveExecutable: resolveTriviumExecutable,
  openConnection: openTriviumServiceConnection
}
let dependencies = realDependencies

type ActiveService = { connection: TriviumServiceConnection; program: string }

// The `root` param carries the workspace, so one local service answers for every
// workspace and the connection is scoped to the host, not to a worktree.
let activeService: ActiveService | null = null
let opening: Promise<ActiveService> | null = null
let consecutiveFailures = 0
let nextAttemptAt = 0
let lastFailure: TriviumServiceUnavailable | null = null
// Quit is terminal: a late poll must not spawn a child the teardown already passed.
let disposed = false

function recordFailure(unavailable: TriviumServiceUnavailable): TriviumServiceUnavailable {
  consecutiveFailures += 1
  const delay = BACKOFF_MS[consecutiveFailures - 1] ?? UNAVAILABLE_HOLD_MS
  nextAttemptAt = Date.now() + delay
  lastFailure = unavailable
  return unavailable
}

function backoffHold(): TriviumServiceUnavailable {
  const remainingMs = Math.max(0, nextAttemptAt - Date.now())
  return {
    reason: 'backoff',
    detail: `${lastFailure?.detail ?? 'trivium service is unavailable'} (retrying in ${Math.ceil(remainingMs / 1000)}s)`
  }
}

async function openService(): Promise<ActiveService> {
  const executable = await dependencies.resolveExecutable()
  if (!executable.ok) {
    const unavailable: TriviumServiceUnavailable = {
      reason: executable.reason === 'not-found' ? 'executable-missing' : 'hydration-failed',
      detail: executable.detail
    }
    throw Object.assign(new Error(unavailable.detail), { unavailable })
  }
  const opened = await dependencies.openConnection({ program: executable.program })
  const service: ActiveService = { connection: opened, program: executable.program }
  opened.onExit((error) => {
    if (activeService === service) {
      activeService = null
    }
    // An unasked-for death starts the backoff clock; a `close()` does not.
    if (error) {
      recordFailure({ reason: 'service-unreachable', detail: error.message })
    }
  })
  return service
}

function unavailableFrom(error: unknown): TriviumServiceUnavailable {
  const carried = (error as { unavailable?: TriviumServiceUnavailable } | null)?.unavailable
  if (carried) {
    return carried
  }
  return {
    reason: 'service-unreachable',
    detail: error instanceof Error ? error.message : String(error)
  }
}

async function acquire(): Promise<ActiveService> {
  if (disposed) {
    throw Object.assign(new Error('trivium service supervisor is disposed'), {
      unavailable: {
        reason: 'service-unreachable',
        detail: 'trivium service supervisor is disposed'
      } satisfies TriviumServiceUnavailable
    })
  }
  if (activeService && !activeService.connection.closed) {
    return activeService
  }
  // Why close and not just drop: a broken stdin marks the connection closed while
  // the child is still alive, so forgetting the handle would strand the process
  // where neither a later request nor `disposeTriviumServices` can reach it.
  const stale = activeService
  activeService = null
  if (stale) {
    void stale.connection.close()
  }
  if (!opening) {
    opening = openService()
      .then((opened) => {
        // A child that died between the handshake and here already recorded its
        // failure: storing it would let the next call skip the hold, and clearing
        // the ladder would erase the failure and respawn immediately.
        if (opened.connection.closed) {
          void opened.connection.close()
          return opened
        }
        activeService = opened
        consecutiveFailures = 0
        nextAttemptAt = 0
        lastFailure = null
        return opened
      })
      .finally(() => {
        opening = null
      })
  }
  return opening
}

/**
 * Calls `method` on the local `trivium service`, opening it on first use.
 * Transport failures come back as `unavailable`; a service `{error}` reply is
 * rejected as a `TriviumServiceError` for the caller to shape.
 */
export async function callTriviumService(
  method: string,
  params: Record<string, unknown> = {},
  options: { timeoutMs?: number } = {}
): Promise<TriviumServiceCallResult> {
  // A stored connection that already died is no service, so the hold applies to it too.
  const live = activeService !== null && !activeService.connection.closed
  if (!live && Date.now() < nextAttemptAt) {
    return { ok: false, unavailable: backoffHold() }
  }
  let active: ActiveService
  try {
    active = await acquire()
  } catch (error) {
    return { ok: false, unavailable: recordFailure(unavailableFrom(error)) }
  }
  try {
    const result = await active.connection.request(method, params, options)
    return {
      ok: true,
      result,
      program: active.program,
      protocol: active.connection.protocol,
      version: active.connection.version
    }
  } catch (error) {
    // A service `{error}` reply is an answer; anything else means the transport failed.
    if (isTriviumServiceError(error)) {
      throw error
    }
    // One slow call on a live connection is not a dead service, and an exit error
    // was already counted by the onExit listener. Counting either here would run
    // the ladder twice as fast as it reads.
    if (isTriviumServiceTimeoutError(error) && !active.connection.closed) {
      return {
        ok: false,
        unavailable: { reason: 'timeout', detail: (error as Error).message }
      }
    }
    if (isTriviumServiceExitError(error)) {
      return { ok: false, unavailable: unavailableFrom(error) }
    }
    return { ok: false, unavailable: recordFailure(unavailableFrom(error)) }
  }
}

/** Tears the local service down on app quit so it cannot outlive the app. */
export async function disposeTriviumServices(): Promise<void> {
  disposed = true
  const active = activeService ?? (await opening?.catch(() => null)) ?? null
  activeService = null
  opening = null
  consecutiveFailures = 0
  nextAttemptAt = 0
  lastFailure = null
  await active?.connection.close()
}

/** @internal - tests inject a fake executable and child. */
export function _setTriviumServiceSupervisorForTests(
  overrides: Partial<TriviumServiceSupervisorDependencies> | null
): void {
  dependencies = overrides ? { ...realDependencies, ...overrides } : realDependencies
  disposed = false
  activeService = null
  opening = null
  consecutiveFailures = 0
  nextAttemptAt = 0
  lastFailure = null
}
