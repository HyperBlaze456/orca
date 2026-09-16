import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcContext, RpcMethod, RpcRequest, RpcSuccess } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { TriviumServiceError } from '../../../trivium/trivium-service-protocol'
import {
  _setTriviumServiceSupervisorForTests,
  disposeTriviumServices
} from '../../../trivium/trivium-service-supervisor'
import { TRIVIUM_METHODS } from './trivium'
// Why the index and not './trivium': this also proves the methods reached ALL_RPC_METHODS.
import { ALL_RPC_METHODS } from './index'

type FakeConnection = {
  request: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakeConnection(request: ReturnType<typeof vi.fn>): FakeConnection {
  return {
    pid: 4242,
    protocol: 1,
    version: '0.4.2',
    closed: false,
    request,
    onExit: () => () => undefined,
    close: vi.fn(async () => undefined)
  } as unknown as FakeConnection
}

function makeDispatcher(target: { path: string; executionHostId: ExecutionHostId }): {
  dispatcher: RpcDispatcher
  resolveTriviumWorkspaceTarget: ReturnType<typeof vi.fn>
} {
  const resolveTriviumWorkspaceTarget = vi.fn().mockResolvedValue(target)
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    resolveTriviumWorkspaceTarget
  } as unknown as OrcaRuntimeService
  return {
    dispatcher: new RpcDispatcher({ runtime, methods: TRIVIUM_METHODS }),
    resolveTriviumWorkspaceTarget
  }
}

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

async function call(
  dispatcher: RpcDispatcher,
  method: string,
  params?: unknown
): Promise<RpcSuccess> {
  const response = await dispatcher.dispatch(makeRequest(method, params))
  if (!response.ok) {
    throw new Error(`${method} failed: ${response.error.code} ${response.error.message}`)
  }
  return response
}

function installService(request: ReturnType<typeof vi.fn>): ReturnType<typeof vi.fn> {
  const openConnection = vi.fn().mockResolvedValue(fakeConnection(request))
  _setTriviumServiceSupervisorForTests({
    resolveExecutable: vi.fn().mockResolvedValue({ ok: true, program: '/usr/local/bin/trivium' }),
    openConnection
  })
  return openConnection
}

beforeEach(() => {
  _setTriviumServiceSupervisorForTests(null)
})

afterEach(async () => {
  await disposeTriviumServices()
  _setTriviumServiceSupervisorForTests(null)
})

describe('trivium RPC methods', () => {
  it('reads workspace status for a local workspace', async () => {
    const request = vi.fn().mockResolvedValue({ state: 'runnable', harness_root: '/repo' })
    installService(request)
    const { dispatcher, resolveTriviumWorkspaceTarget } = makeDispatcher({
      path: '/repo',
      executionHostId: 'local'
    })

    const response = await call(dispatcher, 'trivium.status', { worktree: 'id:ws-1' })

    expect(resolveTriviumWorkspaceTarget).toHaveBeenCalledWith('id:ws-1')
    expect(request).toHaveBeenCalledWith('workspace.status', { root: '/repo' }, {})
    expect(response.result).toEqual({
      supported: true,
      host: 'local',
      state: 'runnable',
      harness_root: '/repo'
    })
  })

  it('forwards only the optional ticket filters the caller supplied', async () => {
    const request = vi.fn().mockResolvedValue({ tickets: [] })
    installService(request)
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    await call(dispatcher, 'trivium.tickets', { worktree: 'id:ws-1', state: 'open' })

    expect(request).toHaveBeenCalledWith('workspace.tickets', { root: '/repo', state: 'open' }, {})
  })

  it('forwards campaign and verbose to workspace.progress', async () => {
    const request = vi.fn().mockResolvedValue({ features: [] })
    installService(request)
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    await call(dispatcher, 'trivium.progress', {
      worktree: 'id:ws-1',
      campaign: 'campaign.7',
      verbose: true
    })

    expect(request).toHaveBeenCalledWith(
      'workspace.progress',
      { root: '/repo', campaign: 'campaign.7', verbose: true },
      {}
    )
  })

  it('refuses a remote execution host by name and never reaches the service', async () => {
    const request = vi.fn()
    installService(request)
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'ssh:dev-box' })

    const response = await call(dispatcher, 'trivium.status', { worktree: 'id:ws-1' })

    expect(response.result).toEqual({
      supported: false,
      host: 'ssh:dev-box',
      reason: 'remote-execution-host'
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('reports unavailable when the executable cannot be found', async () => {
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'not-found', detail: 'no trivium on PATH' }),
      openConnection: vi.fn()
    })
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    const response = await call(dispatcher, 'trivium.goals', { worktree: 'id:ws-1' })

    expect(response.result).toEqual({
      supported: true,
      host: 'local',
      unavailable: { reason: 'executable-missing', detail: 'no trivium on PATH' }
    })
  })

  it('keeps a service error slug instead of failing the RPC call', async () => {
    const request = vi.fn().mockRejectedValue(new TriviumServiceError('no-harness', 'no model'))
    installService(request)
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    const response = await call(dispatcher, 'trivium.goals', { worktree: 'id:ws-1' })

    expect(response.result).toEqual({
      supported: true,
      host: 'local',
      serviceError: { code: 'no-harness', message: 'no model' }
    })
  })

  it('answers availability from ping', async () => {
    const request = vi.fn().mockResolvedValue({ protocol: 1, version: '0.4.2' })
    installService(request)
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    const response = await call(dispatcher, 'trivium.availability')

    expect(response.result).toEqual({
      available: true,
      program: '/usr/local/bin/trivium',
      protocol: 1,
      version: '0.4.2'
    })
  })

  it('answers availability false when trivium is not installed', async () => {
    _setTriviumServiceSupervisorForTests({
      resolveExecutable: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'not-found', detail: 'no trivium on PATH' }),
      openConnection: vi.fn()
    })
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    const response = await call(dispatcher, 'trivium.availability')

    expect(response.result).toEqual({
      available: false,
      reason: 'executable-missing',
      detail: 'no trivium on PATH'
    })
  })

  it('rejects a request with no worktree selector', async () => {
    installService(vi.fn())
    const { dispatcher } = makeDispatcher({ path: '/repo', executionHostId: 'local' })

    const response = await dispatcher.dispatch(makeRequest('trivium.status', {}))

    expect(response.ok).toBe(false)
  })
})

describe('trivium methods on the flat RPC manifest', () => {
  const names = ['availability', 'status', 'progress', 'goals', 'tickets'].map(
    (suffix) => `trivium.${suffix}`
  )

  it.each(names)('registers %s exactly once', (name) => {
    expect(ALL_RPC_METHODS.filter((method) => method.name === name)).toHaveLength(1)
  })

  it('reads status straight through the registered handler', async () => {
    const request = vi.fn().mockResolvedValue({ state: 'runnable' })
    installService(request)
    const method = ALL_RPC_METHODS.find(
      (candidate) => candidate.name === 'trivium.status'
    ) as RpcMethod
    const runtime = {
      resolveTriviumWorkspaceTarget: vi
        .fn()
        .mockResolvedValue({ path: '/repo', executionHostId: 'local' })
    } as unknown as OrcaRuntimeService

    const result = await method.handler({ worktree: 'id:ws-1' }, { runtime } as RpcContext)

    expect(result).toEqual({ supported: true, host: 'local', state: 'runnable' })
  })

  it('refuses an ssh host straight through the registered handler', async () => {
    const request = vi.fn()
    installService(request)
    const method = ALL_RPC_METHODS.find(
      (candidate) => candidate.name === 'trivium.tickets'
    ) as RpcMethod
    const runtime = {
      resolveTriviumWorkspaceTarget: vi
        .fn()
        .mockResolvedValue({ path: '/repo', executionHostId: 'ssh:dev-box' })
    } as unknown as OrcaRuntimeService

    const result = await method.handler({ worktree: 'id:ws-1' }, { runtime } as RpcContext)

    expect(result).toEqual({
      supported: false,
      host: 'ssh:dev-box',
      reason: 'remote-execution-host'
    })
    expect(request).not.toHaveBeenCalled()
  })
})
