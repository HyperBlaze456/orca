// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TriviumStatusRpcResult,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import type { Worktree } from '../../../../shared/worktree/types'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import TriviumPage from './TriviumPage'

const callRuntimeRpcMock = vi.hoisted(() => vi.fn())
const watchWorktreeMock = vi.hoisted(() => vi.fn(async () => {}))
const unwatchWorktreeMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: callRuntimeRpcMock,
  runtimeEnvironmentSupportsCapability: vi.fn(async () => true)
}))

vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: vi.fn(async () => () => {})
}))

const APPROVE_COMMAND = 'trivium model ticket approve ticket.upload-retry'
const initialAppState = useAppStore.getInitialState()
const roots: Root[] = []

function makeWorktree(): Worktree {
  return {
    id: 'wt-1',
    repoId: 'repo-1',
    hostId: 'local',
    path: '/srv/acme',
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: true,
    displayName: 'acme',
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
    path: '/srv/acme',
    connectionId: null,
    badgeColor: '#888888',
    addedAt: 1
  }
}

function makeStatus(): TriviumWorkspaceStatus {
  return {
    schema_version: 1,
    kind: 'workspace-status',
    requested_path: '/srv/acme',
    harness_root: '/srv/acme',
    repository_root: '/srv/acme',
    is_worker_worktree: false,
    state: 'review',
    state_reason: 'A milestone is waiting on your review.',
    publication: { event_id: 'event.0123456789abcdef', model_revision: 'sha256:fedcba9876543210' },
    goals: {
      counts: { g0: 1, g1: 1, g2: 0, g3: 1 },
      normative: 2,
      adopted_normative: 2,
      candidates_to_approve: 1,
      nodes: [
        {
          id: 'goal.purpose',
          tier: 'g0',
          title: 'Ship uploads that survive flaky networks',
          statement: 'Uploads finish or report why.',
          status: 'adopted'
        },
        {
          id: 'goal.outcome',
          tier: 'g1',
          title: 'Resume interrupted uploads',
          statement: 'A dropped connection resumes from the last chunk.',
          status: 'adopted'
        }
      ],
      edges: [
        {
          id: 'goal-edge.1',
          source: 'goal.outcome',
          target: 'goal.purpose',
          relation: 'contributes-to'
        }
      ]
    },
    theory_nodes: 28,
    interviews: [],
    campaigns: { open: [], closed: 4 },
    milestone: {
      campaign_id: 'campaign.uploads',
      summary: 'Three Features landed; retry policy is still unverified.',
      unknowns: 3,
      contradictions: 2,
      promotion_candidates: 1
    },
    escalations: [],
    tickets: {
      by_state: { open: 1, 'in-progress': 0, blocked: 0, done: 3, abandoned: 0 },
      candidates: [
        {
          id: 'ticket.upload-retry',
          title: 'Retry the last chunk once',
          parent: 'goal.outcome',
          approve_command: APPROVE_COMMAND
        }
      ]
    },
    history: { campaigns: 4, features: 9, publications: 12 },
    warnings: []
  }
}

async function renderPage(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(createElement(TooltipProvider, null, createElement(TriviumPage)))
  })
  await act(async () => {
    await Promise.resolve()
  })
  return container
}

beforeEach(() => {
  callRuntimeRpcMock.mockReset()
  watchWorktreeMock.mockClear()
  unwatchWorktreeMock.mockClear()
  const fsApi = { watchWorktree: watchWorktreeMock, unwatchWorktree: unwatchWorktreeMock }
  ;(window as unknown as { api: { fs: typeof fsApi } }).api = { fs: fsApi }
  useAppStore.setState(
    {
      ...initialAppState,
      activeWorktreeId: 'wt-1',
      activeWorkspaceKey: 'worktree:wt-1',
      activeWorkspaceExecutionHostId: 'local',
      repos: [makeRepo()],
      worktreesByRepo: { 'repo-1': [makeWorktree()] }
    },
    true
  )
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount())
  }
  document.body.innerHTML = ''
})

describe('TriviumPage', () => {
  it('renders the review state, the goal outline and the approve command', async () => {
    const result: TriviumStatusRpcResult = { supported: true, host: 'local', ...makeStatus() }
    callRuntimeRpcMock.mockResolvedValue(result)

    const container = await renderPage()

    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'trivium.status',
      { worktree: 'id:wt-1' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Review')
    expect(text).toContain('A milestone is waiting on your review.')
    expect(text).toContain('Ship uploads that survive flaky networks')
    expect(text).toContain('Resume interrupted uploads')
    expect(text).toContain(APPROVE_COMMAND)
    // The publication ids are shortened to 12 characters; the full value lives in a tooltip.
    expect(text).toContain('event.012345…')
  })

  it('renders the unsupported screen when the host does not offer trivium', async () => {
    const result: TriviumStatusRpcResult = {
      supported: false,
      host: 'ssh:build-box',
      reason: 'The remote Orca server has no trivium bridge.'
    }
    callRuntimeRpcMock.mockResolvedValue(result)

    const container = await renderPage()

    const text = container.textContent ?? ''
    expect(text).toContain('Trivium is not available on this host')
    expect(text).toContain('ssh:build-box')
    expect(text).toContain('The remote Orca server has no trivium bridge.')
    expect(text).not.toContain('trivium model init')
  })

  it('turns the remote-execution-host refusal slug into a sentence', async () => {
    const result: TriviumStatusRpcResult = {
      supported: false,
      host: 'runtime:env-1',
      reason: 'remote-execution-host'
    }
    callRuntimeRpcMock.mockResolvedValue(result)

    const container = await renderPage()

    const text = container.textContent ?? ''
    expect(text).toContain('runtime:env-1')
    expect(text).not.toContain('remote-execution-host')
    expect(text).toContain('does not serve this host yet')
  })

  it('shows the executable override when trivium could not start', async () => {
    const result: TriviumStatusRpcResult = {
      supported: true,
      host: 'local',
      unavailable: { reason: 'trivium was not found on PATH', detail: 'spawn trivium ENOENT' }
    }
    callRuntimeRpcMock.mockResolvedValue(result)

    const container = await renderPage()

    const text = container.textContent ?? ''
    expect(text).toContain('trivium was not found on PATH')
    expect(text).toContain('spawn trivium ENOENT')
    expect(text).toContain('TRIVIUM_EXECUTABLE')
  })

  it('renders a service error as an answer with its own code', async () => {
    const result: TriviumStatusRpcResult = {
      supported: true,
      host: 'local',
      serviceError: { code: 'model-error', message: 'current.json is not valid JSON' }
    }
    callRuntimeRpcMock.mockResolvedValue(result)

    const container = await renderPage()

    const text = container.textContent ?? ''
    expect(text).toContain('model-error')
    expect(text).toContain('current.json is not valid JSON')
    expect(text).not.toContain('TRIVIUM_EXECUTABLE')
  })

  it('owns the local filesystem watch while the page is mounted', async () => {
    const result: TriviumStatusRpcResult = { supported: true, host: 'local', ...makeStatus() }
    callRuntimeRpcMock.mockResolvedValue(result)

    await renderPage()

    expect(watchWorktreeMock).toHaveBeenCalledWith({
      worktreePath: '/srv/acme',
      connectionId: undefined
    })
    expect(unwatchWorktreeMock).not.toHaveBeenCalled()

    await act(async () => {
      roots.splice(0).forEach((root) => root.unmount())
    })

    expect(unwatchWorktreeMock).toHaveBeenCalledWith({
      worktreePath: '/srv/acme',
      connectionId: undefined
    })
  })
})
