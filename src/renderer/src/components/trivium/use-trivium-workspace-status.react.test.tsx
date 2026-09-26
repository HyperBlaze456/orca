// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsChangedPayload } from '../../../../shared/filesystem-entry-types'
import type {
  TriviumStatusRpcResult,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import type { Worktree } from '../../../../shared/worktree/types'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import TriviumPage from './TriviumPage'
import { useTriviumWorkspaceStatus } from './use-trivium-workspace-status'

const callRuntimeRpcMock = vi.hoisted(() => vi.fn())
const subscribeRuntimeFileChangesMock = vi.hoisted(() => vi.fn())
const supportsCapabilityMock = vi.hoisted(() => vi.fn(async () => true))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: callRuntimeRpcMock,
  runtimeEnvironmentSupportsCapability: supportsCapabilityMock
}))

vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: subscribeRuntimeFileChangesMock
}))

const roots: Root[] = []
const initialAppState = useAppStore.getInitialState()
let emitFsChange: ((payload: FsChangedPayload) => void) | null = null

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function makeWorktree(id: string, path: string): Worktree {
  return {
    id,
    repoId: 'repo-1',
    hostId: 'local',
    path,
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: true,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

function makeRepo(): AppState['repos'][number] {
  return {
    id: 'repo-1',
    displayName: 'acme',
    path: '/srv/one',
    connectionId: null,
    badgeColor: '#888888',
    addedAt: 1
  }
}

function makeStatus(stateReason: string): TriviumWorkspaceStatus {
  return {
    schema_version: 1,
    kind: 'workspace-status',
    requested_path: '/srv/one',
    harness_root: '/srv/one',
    repository_root: '/srv/one',
    is_worker_worktree: false,
    state: 'runnable',
    state_reason: stateReason,
    publication: null,
    goals: {
      counts: { g0: 0, g1: 0, g2: 0, g3: 0 },
      normative: 0,
      adopted_normative: 0,
      candidates_to_approve: 0,
      nodes: [],
      edges: []
    },
    theory_nodes: 0,
    interviews: [],
    campaigns: { open: [], closed: 0 },
    milestone: null,
    escalations: [],
    tickets: {
      by_state: { open: 0, 'in-progress': 0, blocked: 0, done: 0, abandoned: 0 },
      candidates: []
    },
    history: { campaigns: 0, features: 0, publications: 0 },
    warnings: []
  }
}

function setActiveWorkspace(worktreeId: string): void {
  useAppStore.setState({
    activeWorktreeId: worktreeId,
    activeWorkspaceKey: `worktree:${worktreeId}`
  })
}

async function renderPage(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(createElement(TooltipProvider, null, createElement(TriviumPage)))
  })
  return container
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  callRuntimeRpcMock.mockReset()
  subscribeRuntimeFileChangesMock.mockReset()
  supportsCapabilityMock.mockClear()
  supportsCapabilityMock.mockResolvedValue(true)
  emitFsChange = null
  subscribeRuntimeFileChangesMock.mockImplementation(
    async (_context: unknown, onPayload: (payload: FsChangedPayload) => void) => {
      emitFsChange = onPayload
      return () => {
        emitFsChange = null
      }
    }
  )
  const fsApi = { watchWorktree: vi.fn(async () => {}), unwatchWorktree: vi.fn(async () => {}) }
  ;(window as unknown as { api: { fs: typeof fsApi } }).api = { fs: fsApi }
  useAppStore.setState(
    {
      ...initialAppState,
      activeWorktreeId: 'wt-1',
      activeWorkspaceKey: 'worktree:wt-1',
      activeWorkspaceExecutionHostId: 'local',
      repos: [makeRepo()],
      worktreesByRepo: {
        'repo-1': [makeWorktree('wt-1', '/srv/one'), makeWorktree('wt-2', '/srv/two')]
      }
    },
    true
  )
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount())
  }
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useTriviumWorkspaceStatus', () => {
  it('never renders the previous workspace answer that lands after a switch', async () => {
    const first = deferred<TriviumStatusRpcResult>()
    const second = deferred<TriviumStatusRpcResult>()
    callRuntimeRpcMock.mockImplementation(
      (_target: unknown, _method: string, params: { worktree: string }) =>
        params.worktree === 'id:wt-1' ? first.promise : second.promise
    )

    const container = await renderPage()
    await act(async () => {
      setActiveWorkspace('wt-2')
    })

    first.resolve({ supported: true, host: 'local', ...makeStatus('FIRST WORKSPACE ANSWER') })
    await flush()
    expect(container.textContent ?? '').not.toContain('FIRST WORKSPACE ANSWER')

    second.resolve({ supported: true, host: 'local', ...makeStatus('SECOND WORKSPACE ANSWER') })
    await flush()
    expect(container.textContent ?? '').toContain('SECOND WORKSPACE ANSWER')
  })

  it('refetches once per burst, and only for the five projection inputs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    callRuntimeRpcMock.mockResolvedValue({
      supported: true,
      host: 'local',
      ...makeStatus('initial')
    } satisfies TriviumStatusRpcResult)

    await renderPage()
    await flush()
    expect(
      callRuntimeRpcMock.mock.calls.filter((call) => call[1] === 'trivium.status')
    ).toHaveLength(1)

    // A Campaign's worker checkout carries a copied `.trivium`; its writes are not the project's.
    await act(async () => {
      emitFsChange?.({
        worktreePath: '/srv/one',
        events: [
          {
            kind: 'update',
            absolutePath: '/srv/one/.trivium/work/execution/worktrees/w1/.trivium/model/goals.json'
          },
          { kind: 'update', absolutePath: '/srv/one/src/index.ts' }
        ]
      })
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(
      callRuntimeRpcMock.mock.calls.filter((call) => call[1] === 'trivium.status')
    ).toHaveLength(1)

    await act(async () => {
      emitFsChange?.({
        worktreePath: '/srv/one',
        events: [{ kind: 'update', absolutePath: '/srv/one/.trivium/ledger/current.json' }]
      })
      emitFsChange?.({
        worktreePath: '/srv/one',
        events: [
          { kind: 'update', absolutePath: '/srv/one/.trivium/work/campaigns/c1/events/1.json' }
        ]
      })
      await vi.advanceTimersByTimeAsync(600)
    })
    // One refetch for the burst, not one per event.
    expect(
      callRuntimeRpcMock.mock.calls.filter((call) => call[1] === 'trivium.status')
    ).toHaveLength(2)
  })

  it('refuses a remote host that does not announce the trivium methods', async () => {
    supportsCapabilityMock.mockResolvedValue(false)
    useAppStore.setState({
      worktreesByRepo: {
        'repo-1': [{ ...makeWorktree('wt-1', '/srv/one'), hostId: 'runtime:env-1' }]
      },
      activeWorkspaceExecutionHostId: 'runtime:env-1'
    })

    const container = await renderPage()
    await flush()

    expect(callRuntimeRpcMock).not.toHaveBeenCalled()
    const text = container.textContent ?? ''
    expect(text).toContain('Trivium is not available on this host')
    expect(text).toContain('runtime:env-1')
    expect(text).not.toContain('method_not_found')
  })
})

describe('status answers over time', () => {
  it('keeps the last answer through a failed refresh and counts only answers with data', async () => {
    const answer = { supported: true, host: 'local', ...makeStatus('first') }
    callRuntimeRpcMock
      .mockResolvedValueOnce(answer)
      .mockRejectedValueOnce(new Error('Execution host is unreachable.'))
      .mockResolvedValueOnce({ supported: true, host: 'local', ...makeStatus('second') })
    const { result } = renderHook(() => useTriviumWorkspaceStatus('wt-1', '/srv/one', null))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.dataRevision).toBe(1)
    const arrived = result.current.updatedAt
    expect(arrived).toEqual(expect.any(Number))

    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.phase).toBe('error'))
    // Loss of contact keeps the data and when it arrived; nothing new was read.
    expect(result.current.data).toBe(answer)
    expect(result.current.updatedAt).toBe(arrived)
    expect(result.current.dataRevision).toBe(1)
    expect(result.current.reason).toBe('Execution host is unreachable.')

    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.data?.state_reason).toBe('second'))
    expect(result.current.phase).toBe('ready')
    expect(result.current.dataRevision).toBe(2)
  })

  it('starts another workspace from nothing', async () => {
    callRuntimeRpcMock.mockResolvedValue({ supported: true, host: 'local', ...makeStatus('any') })
    const { result, rerender } = renderHook(
      ({ id, path }) => useTriviumWorkspaceStatus(id, path, null),
      { initialProps: { id: 'wt-1', path: '/srv/one' } }
    )
    await waitFor(() => expect(result.current.dataRevision).toBe(1))
    rerender({ id: 'wt-2', path: '/srv/two' })
    expect(result.current).toMatchObject({ phase: 'loading', data: null, dataRevision: 0 })
    expect(result.current.updatedAt).toBeUndefined()
    await waitFor(() => expect(result.current.dataRevision).toBe(1))
  })
})
