import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _setTriviumServiceSupervisorForTests,
  callTriviumService,
  disposeTriviumServices
} from './trivium-service-supervisor'
import {
  TriviumServiceExitError,
  TriviumServiceTimeoutError,
  type TriviumServiceConnection
} from './trivium-service-connection'
import { TriviumServiceError } from './trivium-service-protocol'

type FakeConnection = TriviumServiceConnection & {
  request: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  die: (error: Error | null) => void
}

function fakeConnection(): FakeConnection {
  const exitListeners = new Set<(error: Error | null) => void>()
  let closed = false
  let reportedExit: { error: Error | null } | null = null
  const connection = {
    pid: 4242,
    protocol: 1,
    version: '0.4.2',
    get closed() {
      return closed
    },
    request: vi.fn().mockResolvedValue({ state: 'runnable' }),
    onExit: (listener: (error: Error | null) => void) => {
      // Mirrors the real connection: a subscriber arriving after the exit hears it at once.
      if (reportedExit) {
        listener(reportedExit.error)
        return () => undefined
      }
      exitListeners.add(listener)
      return () => exitListeners.delete(listener)
    },
    close: vi.fn(async () => {
      closed = true
    }),
    die: (error: Error | null) => {
      closed = true
      reportedExit = { error }
      for (const listener of exitListeners) {
        listener(error)
      }
      exitListeners.clear()
    }
  }
  return connection as unknown as FakeConnection
}

const FOUND = { ok: true as const, program: '/usr/local/bin/trivium' }

beforeEach(() => {
  _setTriviumServiceSupervisorForTests(null)
})

afterEach(async () => {
  vi.useRealTimers()
  await disposeTriviumServices()
  _setTriviumServiceSupervisorForTests(null)
})

describe('callTriviumService', () => {
  it('opens one connection lazily and reuses it', async () => {
    const connection = fakeConnection()
    const openConnection = vi.fn().mockResolvedValue(connection)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    const first = await callTriviumService('workspace.status', { root: '/repo' })
    const second = await callTriviumService('workspace.goals', { root: '/repo' })

    expect(openConnection).toHaveBeenCalledTimes(1)
    expect(openConnection).toHaveBeenCalledWith({ program: '/usr/local/bin/trivium' })
    expect(first).toMatchObject({
      ok: true,
      result: { state: 'runnable' },
      program: '/usr/local/bin/trivium',
      protocol: 1,
      version: '0.4.2'
    })
    expect(second.ok).toBe(true)
  })

  it('reports a missing executable as unavailable without spawning', async () => {
    const openConnection = vi.fn()
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'not-found', detail: 'no trivium on PATH' }),
      openConnection
    })

    await expect(callTriviumService('ping')).resolves.toEqual({
      ok: false,
      unavailable: { reason: 'executable-missing', detail: 'no trivium on PATH' }
    })
    expect(openConnection).not.toHaveBeenCalled()
  })

  it('lets a service error reply through instead of calling it unavailable', async () => {
    const connection = fakeConnection()
    connection.request.mockRejectedValue(new TriviumServiceError('no-harness', 'no model'))
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection: vi.fn().mockResolvedValue(connection)
    })

    await expect(callTriviumService('workspace.goals', { root: '/repo' })).rejects.toBeInstanceOf(
      TriviumServiceError
    )
  })

  it('backs off 1s, 2s and 4s before holding unavailable for 30s', async () => {
    vi.useFakeTimers()
    const openConnection = vi.fn().mockRejectedValue(new Error('spawn refused'))
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    const attemptAfter = async (ms: number): Promise<void> => {
      await vi.advanceTimersByTimeAsync(ms)
      await callTriviumService('ping')
    }

    // Each failure schedules the next attempt; a call inside the window never spawns.
    await callTriviumService('ping')
    expect(openConnection).toHaveBeenCalledTimes(1)

    await attemptAfter(500)
    expect(openConnection).toHaveBeenCalledTimes(1)
    await attemptAfter(600)
    expect(openConnection).toHaveBeenCalledTimes(2)

    await attemptAfter(1_500)
    expect(openConnection).toHaveBeenCalledTimes(2)
    await attemptAfter(600)
    expect(openConnection).toHaveBeenCalledTimes(3)

    await attemptAfter(4_100)
    expect(openConnection).toHaveBeenCalledTimes(4)

    // Fourth failure and beyond: a 30s hold, not another 4s retry.
    await attemptAfter(10_000)
    expect(openConnection).toHaveBeenCalledTimes(4)
    const held = await callTriviumService('ping')
    expect(held).toMatchObject({ ok: false, unavailable: { reason: 'backoff' } })

    await attemptAfter(20_100)
    expect(openConnection).toHaveBeenCalledTimes(5)
  })

  it('reopens on the next request after an unexpected exit, once the backoff elapses', async () => {
    vi.useFakeTimers()
    const first = fakeConnection()
    const second = fakeConnection()
    const openConnection = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    await callTriviumService('ping')
    first.die(new Error('trivium service exited'))

    const duringBackoff = await callTriviumService('ping')
    expect(duringBackoff).toMatchObject({ ok: false, unavailable: { reason: 'backoff' } })
    expect(openConnection).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_100)
    await expect(callTriviumService('ping')).resolves.toMatchObject({ ok: true })
    expect(openConnection).toHaveBeenCalledTimes(2)
  })

  it('holds the backoff when the child dies right after its ready line', async () => {
    vi.useFakeTimers()
    const deadOnArrival = fakeConnection()
    const second = fakeConnection()
    const openConnection = vi
      .fn()
      .mockImplementationOnce(async () => {
        // The exit lands before the supervisor has stored the connection.
        deadOnArrival.die(new Error('trivium service exited'))
        return deadOnArrival
      })
      .mockResolvedValue(second)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    await callTriviumService('ping')
    expect(deadOnArrival.close).toHaveBeenCalled()

    const duringBackoff = await callTriviumService('ping')
    expect(duringBackoff).toMatchObject({ ok: false, unavailable: { reason: 'backoff' } })
    expect(openConnection).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_100)
    await expect(callTriviumService('ping')).resolves.toMatchObject({ ok: true })
    expect(openConnection).toHaveBeenCalledTimes(2)
  })

  it('closes the live connection on dispose', async () => {
    const connection = fakeConnection()
    const openConnection = vi.fn().mockResolvedValue(connection)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    await callTriviumService('ping')
    await disposeTriviumServices()

    expect(connection.close).toHaveBeenCalledTimes(1)
  })
})

describe('callTriviumService failure accounting', () => {
  it('reaps a connection that reports closed while its child still lives', async () => {
    // A broken stdin closes the connection without the child exiting; dropping the
    // handle would strand that process beyond the reach of dispose.
    const stale = fakeConnection()
    const replacement = fakeConnection()
    let closed = false
    Object.defineProperty(stale, 'closed', { get: () => closed })
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection: vi.fn().mockResolvedValueOnce(stale).mockResolvedValue(replacement)
    })

    await callTriviumService('ping')
    closed = true
    await callTriviumService('ping')

    expect(stale.close).toHaveBeenCalledTimes(1)
  })

  it('does not advance the backoff ladder for a timeout on a live connection', async () => {
    const connection = fakeConnection()
    connection.request.mockRejectedValue(new TriviumServiceTimeoutError('ping exceeded 20000ms'))
    const openConnection = vi.fn().mockResolvedValue(connection)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    const first = await callTriviumService('ping')
    expect(first).toMatchObject({ ok: false, unavailable: { reason: 'timeout' } })

    // No hold: the very next call still reaches the live connection.
    const second = await callTriviumService('ping')
    expect(second).toMatchObject({ ok: false, unavailable: { reason: 'timeout' } })
    expect(connection.request).toHaveBeenCalledTimes(2)
    expect(openConnection).toHaveBeenCalledTimes(1)
  })

  it('counts an exit during an in-flight request once, not twice', async () => {
    vi.useFakeTimers()
    const first = fakeConnection()
    const second = fakeConnection()
    // The request rejects with the same exit error the onExit listener already saw.
    first.request.mockImplementation(async () => {
      first.die(new TriviumServiceExitError('trivium service exited'))
      throw new TriviumServiceExitError('trivium service exited')
    })
    const openConnection = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    await callTriviumService('ping')

    // One failure means the first rung, 1s — not 2s from a double count.
    await vi.advanceTimersByTimeAsync(1_100)
    await expect(callTriviumService('ping')).resolves.toMatchObject({ ok: true })
    expect(openConnection).toHaveBeenCalledTimes(2)
  })

  it('opens one child for two concurrent first calls', async () => {
    const connection = fakeConnection()
    const openConnection = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(connection), 10)))
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    const [a, b] = await Promise.all([callTriviumService('ping'), callTriviumService('ping')])

    expect(openConnection).toHaveBeenCalledTimes(1)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
  })

  it('is terminal after dispose and refuses to spawn again', async () => {
    const connection = fakeConnection()
    const openConnection = vi.fn().mockResolvedValue(connection)
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    await callTriviumService('ping')
    await disposeTriviumServices()
    const afterQuit = await callTriviumService('ping')

    expect(afterQuit).toMatchObject({ ok: false })
    expect(openConnection).toHaveBeenCalledTimes(1)
  })

  it('closes a connection that was still opening when dispose ran', async () => {
    const connection = fakeConnection()
    const openConnection = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(connection), 10)))
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi.fn().mockResolvedValue(FOUND),
      openConnection
    })

    const inFlight = callTriviumService('ping')
    await disposeTriviumServices()
    await inFlight

    expect(connection.close).toHaveBeenCalledTimes(1)
  })
})
