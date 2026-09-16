import { spawnProcess } from '../../shared/child-process/run-process'
import {
  forceTerminateProcessTree,
  signalProcessTree
} from '../../shared/child-process/process-tree-termination'
import {
  NDJSON_MAX_LINE_BYTES,
  createIncrementalNdjsonFramer
} from '../../shared/main-process-ndjson-framer'
import {
  TriviumServiceError,
  parseTriviumReadyLine,
  parseTriviumReply,
  type TriviumServiceReady
} from './trivium-service-protocol'

export const TRIVIUM_SERVICE_MAX_LINE_BYTES = NDJSON_MAX_LINE_BYTES
const READY_TIMEOUT_MS = 10_000
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const GRACEFUL_EXIT_MS = 1_500
const FORCED_EXIT_MS = 1_000
const STDERR_TAIL_MAX_BYTES = 8192

export type TriviumServiceConnection = {
  readonly pid: number | undefined
  readonly protocol: number
  readonly version: string
  readonly closed: boolean
  request(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<unknown>
  /** Fires once when the child dies. Returns an unsubscribe. */
  onExit(listener: (error: Error | null) => void): () => void
  close(): Promise<void>
}

export type TriviumServiceLaunch = {
  program: string
  cwd?: string
  spawnImpl?: typeof spawnProcess
}

type Pending = {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class TriviumServiceExitError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'TriviumServiceExitError'
  }
}

export class TriviumServiceTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TriviumServiceTimeoutError'
  }
}

export function isTriviumServiceExitError(error: unknown): error is TriviumServiceExitError {
  return error instanceof TriviumServiceExitError
}

export function isTriviumServiceTimeoutError(error: unknown): error is TriviumServiceTimeoutError {
  return error instanceof TriviumServiceTimeoutError
}

/**
 * Spawns `<program> service`, waits for its `ready` line, and returns a
 * connection that stays open until `close()`. Rejects — after reaping the
 * child — when the handshake cannot complete.
 */
export async function openTriviumServiceConnection(
  launch: TriviumServiceLaunch
): Promise<TriviumServiceConnection> {
  const spawnImpl = launch.spawnImpl ?? spawnProcess
  // Why detached on POSIX: `signalProcessTree` addresses the process group, so the
  // child must lead its own or the signal would reach Orca's group instead. Windows
  // walks the tree by pid, and a new console there would be a visible window.
  const child = spawnImpl({
    program: launch.program,
    args: ['service'],
    cwd: launch.cwd,
    detached: process.platform !== 'win32'
  })

  const pending = new Map<string | number, Pending>()
  const exitListeners = new Set<(error: Error | null) => void>()
  let stderrTail = ''
  let nextRequestId = 1
  let exited = false
  let closing = false
  let exitReported = false
  let terminalError: Error | null = null
  let ready: TriviumServiceReady | null = null
  let onReady: ((result: TriviumServiceReady | Error) => void) | null = null

  let resolveExit = (): void => undefined
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve
  })

  function exitError(cause?: Error): Error {
    const tail = stderrTail.trim()
    const detail = [
      'trivium service exited',
      cause ? `(${cause.message})` : null,
      tail ? `stderr: ${tail}` : null
    ]
      .filter(Boolean)
      .join(' ')
    return new TriviumServiceExitError(detail)
  }

  function failPending(error: Error): void {
    for (const [id, entry] of pending) {
      pending.delete(id)
      clearTimeout(entry.timer)
      entry.reject(error)
    }
  }

  /** One terminal cause, reported once: a dead child reaches us through several listeners. */
  function handleTerminalEnd(cause?: Error): void {
    if (!terminalError) {
      terminalError = exitError(cause)
      onReady?.(terminalError)
      failPending(terminalError)
    }
    if (exited && !exitReported) {
      exitReported = true
      const reported = closing ? null : terminalError
      for (const listener of exitListeners) {
        listener(reported)
      }
      exitListeners.clear()
    }
  }

  function observeExit(): void {
    exited = true
    resolveExit()
    handleTerminalEnd()
  }

  child.on('exit', observeExit)
  child.on('close', observeExit)
  child.on('error', (error: Error) => handleTerminalEnd(error))
  child.stdin.on('error', (error: Error) => handleTerminalEnd(error))
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_MAX_BYTES)
  })

  const framer = createIncrementalNdjsonFramer(
    (record, line) => {
      if (!ready) {
        const parsed = parseTriviumReadyLine(record)
        if (!parsed) {
          onReady?.(new Error('trivium service did not announce ready on its first line'))
          return
        }
        ready = parsed
        onReady?.(parsed)
        return
      }
      const reply = parseTriviumReply(record, line)
      if (reply.kind === 'unrecognized') {
        return
      }
      const entry = pending.get(reply.id)
      if (!entry) {
        return
      }
      pending.delete(reply.id)
      clearTimeout(entry.timer)
      if (reply.kind === 'error') {
        entry.reject(reply.error)
      } else if (reply.kind === 'malformed') {
        entry.reject(
          new TriviumServiceError(
            'invalid-reply',
            `trivium service ${entry.method} replied with neither result nor error`
          )
        )
      } else {
        entry.resolve(reply.result)
      }
    },
    (rejected) => {
      if (rejected.kind === 'invalid-json') {
        // A malformed line is diagnostic noise, not a dead transport.
        return
      }
      handleTerminalEnd(
        new Error(
          `trivium service line exceeds ${rejected.maxLineBytes} bytes (${rejected.observedBytes} received)`
        )
      )
      void forceTerminateProcessTree(child)
    },
    { maxLineBytes: TRIVIUM_SERVICE_MAX_LINE_BYTES }
  )

  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    try {
      framer.feed(chunk)
    } catch (error) {
      handleTerminalEnd(error instanceof Error ? error : new Error(String(error)))
    }
  })

  function request(
    method: string,
    params: Record<string, unknown> = {},
    options: { timeoutMs?: number } = {}
  ): Promise<unknown> {
    if (terminalError) {
      return Promise.reject(terminalError)
    }
    if (closing || exited) {
      return Promise.reject(new TriviumServiceExitError(`trivium service is closed (${method})`))
    }
    const id = nextRequestId++
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new TriviumServiceTimeoutError(`trivium service ${method} exceeded ${timeoutMs}ms`))
      }, timeoutMs)
      pending.set(id, { method, resolve, reject, timer })
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
      } catch (error) {
        pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async function waitForExit(ms: number): Promise<void> {
    if (exited) {
      return
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      void exitPromise.then(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async function close(): Promise<void> {
    if (closing) {
      await waitForExit(GRACEFUL_EXIT_MS + FORCED_EXIT_MS)
      return
    }
    closing = true
    try {
      child.stdin.end()
    } catch {
      // Already destroyed; the reap below still runs.
    }
    await waitForExit(GRACEFUL_EXIT_MS)
    if (!exited) {
      // Why the tree and not the handle: a Windows `trivium.cmd` runs under
      // cmd.exe, so the program we care about is a descendant, not the root.
      await signalProcessTree(child, 'SIGTERM')
      await waitForExit(FORCED_EXIT_MS)
    }
    if (!exited) {
      await forceTerminateProcessTree(child)
      await waitForExit(FORCED_EXIT_MS)
    }
    failPending(new TriviumServiceExitError('trivium service connection closed'))
  }

  const handshake = await new Promise<TriviumServiceReady | Error>((resolve) => {
    const timer = setTimeout(
      () => resolve(new TriviumServiceTimeoutError('trivium service did not become ready in 10s')),
      READY_TIMEOUT_MS
    )
    onReady = (result): void => {
      onReady = null
      clearTimeout(timer)
      resolve(result)
    }
  })
  if (handshake instanceof Error) {
    await close()
    throw handshake
  }

  return {
    get pid() {
      return child.pid
    },
    protocol: handshake.protocol,
    version: handshake.version,
    get closed() {
      return closing || exited || terminalError !== null
    },
    request,
    onExit: (listener) => {
      if (exitReported) {
        listener(closing ? null : terminalError)
        return () => undefined
      }
      exitListeners.add(listener)
      return () => {
        exitListeners.delete(listener)
      }
    },
    close
  }
}

export { TriviumServiceError }
