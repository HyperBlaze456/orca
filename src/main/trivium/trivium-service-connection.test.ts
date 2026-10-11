import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { spawnProcess } from '@orca/process-host'
import {
  TRIVIUM_SERVICE_MAX_LINE_BYTES,
  openTriviumServiceConnection,
  type TriviumServiceConnection
} from './trivium-service-connection'
import { TriviumServiceError } from './trivium-service-protocol'

const { signalProcessTree, forceTerminateProcessTree } = vi.hoisted(() => ({
  signalProcessTree: vi.fn(async () => true),
  forceTerminateProcessTree: vi.fn(async () => true)
}))

vi.mock('@orca/process-host/process-tree-termination', () => ({
  signalProcessTree,
  forceTerminateProcessTree
}))

type SpawnedSpec = {
  program: string
  args?: readonly string[]
  cwd?: string
  detached?: boolean
}

type StubChild = EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  pid: number
  kill: ReturnType<typeof vi.fn>
}

type Stub = {
  child: StubChild
  spawnImpl: typeof spawnProcess
  written: Record<string, unknown>[]
  spawnedWith: SpawnedSpec | null
  send: (payload: unknown) => void
  sendRaw: (line: string) => void
}

/** Full control over framing and death, which a real child cannot give. */
function stubChild(options: { exitOnStdinEnd?: boolean } = {}): Stub {
  const child = new EventEmitter() as StubChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  // Keep the synthetic pid outside any real process table so teardown never
  // mistakes an unrelated process for this stub.
  child.pid = 9_999_998
  child.kill = vi.fn()
  const written: Record<string, unknown>[] = []
  child.stdin.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim()) {
        written.push(JSON.parse(line) as Record<string, unknown>)
      }
    }
  })
  if (options.exitOnStdinEnd !== false) {
    child.stdin.on('finish', () => child.emit('exit', 0, null))
  }
  const stub: Stub = {
    child,
    written,
    spawnedWith: null,
    spawnImpl: ((spec: SpawnedSpec) => {
      stub.spawnedWith = spec
      return child
    }) as unknown as typeof spawnProcess,
    send: (payload) => child.stdout.write(`${JSON.stringify(payload)}\n`),
    sendRaw: (line) => child.stdout.write(line)
  }
  return stub
}

const READY = { event: 'ready', protocol: 1, version: '0.4.2' }

async function openWithReady(stub: Stub, cwd?: string): Promise<TriviumServiceConnection> {
  const opening = openTriviumServiceConnection({
    program: '/bin/trivium',
    cwd,
    spawnImpl: stub.spawnImpl
  })
  stub.send(READY)
  return opening
}

beforeEach(() => {
  signalProcessTree.mockClear()
  forceTerminateProcessTree.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('openTriviumServiceConnection', () => {
  it('spawns `<program> service` and reports the ready line', async () => {
    const stub = stubChild()
    const connection = await openWithReady(stub, '/repo')

    expect(stub.spawnedWith).toMatchObject({
      program: '/bin/trivium',
      args: ['service'],
      cwd: '/repo'
    })
    expect(connection.protocol).toBe(1)
    expect(connection.version).toBe('0.4.2')
    expect(connection.closed).toBe(false)
  })

  it('correlates concurrent replies by request id', async () => {
    const stub = stubChild()
    const connection = await openWithReady(stub)

    const status = connection.request('workspace.status', { root: '/a' })
    const goals = connection.request('workspace.goals', { root: '/b' })
    await vi.waitFor(() => expect(stub.written).toHaveLength(2))

    const [first, second] = stub.written
    expect(first).toMatchObject({ method: 'workspace.status', params: { root: '/a' } })
    expect(second).toMatchObject({ method: 'workspace.goals', params: { root: '/b' } })

    // Out of order on purpose: the id, not arrival order, decides the caller.
    stub.send({ id: second.id, result: { nodes: [] } })
    stub.send({ id: first.id, result: { state: 'runnable' } })

    await expect(status).resolves.toEqual({ state: 'runnable' })
    await expect(goals).resolves.toEqual({ nodes: [] })
  })

  it('maps an error reply to a TriviumServiceError carrying its code', async () => {
    const stub = stubChild()
    const connection = await openWithReady(stub)

    const pending = connection.request('workspace.goals', { root: '/a' })
    await vi.waitFor(() => expect(stub.written).toHaveLength(1))
    stub.send({
      id: stub.written[0].id,
      error: { code: 'no-harness', message: '.trivium/model is missing' }
    })

    const error = await pending.catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(TriviumServiceError)
    expect((error as TriviumServiceError).code).toBe('no-harness')
    expect((error as TriviumServiceError).message).toBe('.trivium/model is missing')
  })

  it('rejects and reaps when the first line is not `ready`', async () => {
    const stub = stubChild()
    const opening = openTriviumServiceConnection({
      program: '/bin/trivium',
      spawnImpl: stub.spawnImpl
    })
    stub.send({ id: 1, result: {} })

    await expect(opening).rejects.toThrow(/did not announce ready/)
    expect(stub.child.stdin.writableEnded).toBe(true)
  })

  it('rejects when the service never becomes ready within 10s', async () => {
    vi.useFakeTimers()
    const stub = stubChild()
    const opening = openTriviumServiceConnection({
      program: '/bin/trivium',
      spawnImpl: stub.spawnImpl
    })
    const settled = opening.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.advanceTimersByTimeAsync(3_000)

    expect(await settled).toMatchObject({ name: 'TriviumServiceTimeoutError' })
  })

  it('times out one request without killing the connection', async () => {
    vi.useFakeTimers()
    const stub = stubChild()
    const connection = await openWithReady(stub)

    const slow = connection.request('workspace.status', { root: '/a' }, { timeoutMs: 50 })
    const settled = slow.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(60)

    expect(await settled).toMatchObject({ name: 'TriviumServiceTimeoutError' })
    expect(connection.closed).toBe(false)
  })

  it('rejects every pending request and reports an unexpected exit', async () => {
    const stub = stubChild({ exitOnStdinEnd: false })
    const connection = await openWithReady(stub)
    const exits: (Error | null)[] = []
    connection.onExit((error) => exits.push(error))

    const pending = connection.request('workspace.status', { root: '/a' })
    stub.child.stderr.write('Traceback: boom\n')
    await vi.waitFor(() => expect(stub.written).toHaveLength(1))
    stub.child.emit('exit', 1, null)

    await expect(pending).rejects.toThrow(/trivium service exited/)
    expect(connection.closed).toBe(true)
    expect(exits).toHaveLength(1)
    expect(exits[0]?.message).toContain('Traceback: boom')
  })

  it('terminates the tree on a line past the NDJSON size cap', async () => {
    const stub = stubChild({ exitOnStdinEnd: false })
    const connection = await openWithReady(stub)
    const pending = connection.request('workspace.status', { root: '/a' })

    // One unterminated chunk past the cap is enough for the framer to reject it.
    stub.sendRaw('x'.repeat(TRIVIUM_SERVICE_MAX_LINE_BYTES + 1))

    await expect(pending).rejects.toThrow(/exceeds/)
    expect(forceTerminateProcessTree).toHaveBeenCalledWith(stub.child)
  })

  it('closes by ending stdin and reports no error to exit listeners', async () => {
    const stub = stubChild()
    const connection = await openWithReady(stub)
    const exits: (Error | null)[] = []
    connection.onExit((error) => exits.push(error))

    await connection.close()

    expect(stub.child.stdin.writableEnded).toBe(true)
    expect(connection.closed).toBe(true)
    expect(exits).toEqual([null])
  })
})

describe('openTriviumServiceConnection teardown and malformed replies', () => {
  it('leads its own process group on POSIX so a group signal cannot reach Orca', async () => {
    const stub = stubChild()
    await openWithReady(stub)

    expect(stub.spawnedWith?.detached).toBe(process.platform !== 'win32')
  })

  it('escalates a close through SIGTERM then the forced process tree', async () => {
    vi.useFakeTimers()
    // A child that ignores stdin.end() and SIGTERM is what forces both rungs.
    const stub = stubChild({ exitOnStdinEnd: false })
    const connection = await openWithReady(stub)

    const closing = connection.close()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(signalProcessTree).toHaveBeenCalledWith(stub.child, 'SIGTERM')
    expect(forceTerminateProcessTree).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(forceTerminateProcessTree).toHaveBeenCalledWith(stub.child)

    await vi.advanceTimersByTimeAsync(1_000)
    await closing
  })

  it('stops at SIGTERM when the child exits on it', async () => {
    vi.useFakeTimers()
    const stub = stubChild({ exitOnStdinEnd: false })
    const connection = await openWithReady(stub)
    signalProcessTree.mockImplementation(async () => {
      stub.child.emit('exit', 0, null)
      return true
    })

    const closing = connection.close()
    await vi.advanceTimersByTimeAsync(1_500)
    await closing

    expect(signalProcessTree).toHaveBeenCalledWith(stub.child, 'SIGTERM')
    expect(forceTerminateProcessTree).not.toHaveBeenCalled()
    signalProcessTree.mockImplementation(async () => true)
  })

  it('fails the named request when a reply carries an id but no result or error', async () => {
    const stub = stubChild()
    const connection = await openWithReady(stub)

    const pending = connection.request('workspace.status', { root: '/a' })
    await vi.waitFor(() => expect(stub.written).toHaveLength(1))
    stub.send({ id: stub.written[0].id, unexpected: true })

    const error = await pending.catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(TriviumServiceError)
    expect((error as TriviumServiceError).code).toBe('invalid-reply')
    // Why still open: one off-contract line is not evidence the child is gone.
    expect(connection.closed).toBe(false)
  })
})
