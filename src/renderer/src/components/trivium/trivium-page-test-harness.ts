import { vi } from 'vitest'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TriviumStatusRpcResult } from '../../../../shared/trivium-workspace-status'
import type { Worktree } from '../../../../shared/worktree/types'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  makeTriviumModelStatus,
  makeTriviumModelTicketRecords
} from './trivium-model-graph.fixture'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import type { TriviumFixtureBinary } from './trivium-model-tables.fixture'
import { useTriviumSessionState } from './trivium-session-state'

// Page tests render the real TriviumPage against WO-1a's real-shaped fixture; each test file
// mocks `@/runtime/runtime-rpc-client` and routes `callRuntimeRpc` through `pageRpc`.

export const PAGE_WORKTREE_ID = 'wt-1'
export const PAGE_WORKTREE_PATH = '/srv/acme'
const AGENT_LEAF = '11111111-1111-4111-8111-111111111111'

export type PageMethod = 'trivium.status' | 'trivium.tickets' | 'trivium.progress'
export type PageRpcHandlers = Partial<Record<PageMethod, () => Promise<unknown>>>

export function statusAnswer(
  edit?: (status: TriviumStatusRpcResult) => TriviumStatusRpcResult
): TriviumStatusRpcResult {
  const answer: TriviumStatusRpcResult = {
    supported: true,
    host: 'local',
    ...makeTriviumModelStatus()
  }
  return edit ? edit(answer) : answer
}

export function ticketsAnswer(binary: TriviumFixtureBinary = 'head'): Record<string, unknown> {
  return { supported: true, host: 'local', tickets: makeTriviumModelTicketRecords(binary) }
}

export function progressAnswer(binary: TriviumFixtureBinary = 'head'): Record<string, unknown> {
  return { supported: true, host: 'local', ...makeTriviumModelProgress(binary) }
}

/** `callRuntimeRpc` for the page: the fixture's three reads unless a handler overrides one. */
export function pageRpc(
  handlers: PageRpcHandlers = {}
): (target: unknown, method: string) => Promise<unknown> {
  const defaults: Record<PageMethod, () => Promise<unknown>> = {
    'trivium.status': async () => statusAnswer(),
    'trivium.tickets': async () => ticketsAnswer(),
    'trivium.progress': async () => progressAnswer()
  }
  return async (_target, method) => {
    const handler =
      method === 'trivium.status' || method === 'trivium.tickets' || method === 'trivium.progress'
        ? (handlers[method] ?? defaults[method])
        : null
    if (!handler) {
      throw new Error(`Unexpected runtime call ${method}`)
    }
    return handler()
  }
}

export function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

function makePageWorktree(): Worktree {
  return {
    id: PAGE_WORKTREE_ID,
    repoId: 'repo-1',
    hostId: 'local',
    path: PAGE_WORKTREE_PATH,
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

function makePageRepo(): AppState['repos'][number] {
  return {
    id: 'repo-1',
    displayName: 'acme',
    path: PAGE_WORKTREE_PATH,
    connectionId: null,
    badgeColor: '#888888',
    addedAt: 1
  }
}

export function makeFolderWorkspace(id: string, folderPath: string): FolderWorkspace {
  return {
    id,
    projectGroupId: 'group-1',
    name: 'notes',
    folderPath,
    executionHostId: 'local',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    createdAt: 0,
    updatedAt: 0
  }
}

/** A fresh store whose active workspace is the local `wt-1` worktree, and no stored page state. */
export function resetPageStore(): void {
  localStorage.clear()
  useTriviumSessionState.setState({ sessions: {} })
  useAppStore.setState(
    {
      ...useAppStore.getInitialState(),
      activeWorktreeId: PAGE_WORKTREE_ID,
      activeWorkspaceKey: `worktree:${PAGE_WORKTREE_ID}`,
      activeWorkspaceExecutionHostId: 'local',
      repos: [makePageRepo()],
      worktreesByRepo: { 'repo-1': [makePageWorktree()] }
    },
    true
  )
}

export type PageApi = {
  writeClipboardText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
  watchWorktree: ReturnType<typeof vi.fn<(args: unknown) => Promise<void>>>
  unwatchWorktree: ReturnType<typeof vi.fn<(args: unknown) => Promise<void>>>
}

/** The preload bridge the page touches: clipboard and the local file watch. */
export function stubPageApi(): PageApi {
  const api: PageApi = {
    writeClipboardText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(),
    watchWorktree: vi.fn<(args: unknown) => Promise<void>>().mockResolvedValue(),
    unwatchWorktree: vi.fn<(args: unknown) => Promise<void>>().mockResolvedValue()
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { writeClipboardText: api.writeClipboardText },
      fs: { watchWorktree: api.watchWorktree, unwatchWorktree: api.unwatchWorktree }
    }
  })
  return api
}

/** One Codex terminal in `workspaceId` that can take a request. */
export function seedAgentSession(workspaceId: string): void {
  const paneKey = makePaneKey('tab-a', AGENT_LEAF)
  useAppStore.setState({
    activeTabIdByWorktree: { [workspaceId]: 'tab-a' },
    tabsByWorktree: {
      [workspaceId]: [
        {
          id: 'tab-a',
          worktreeId: workspaceId,
          ptyId: null,
          title: 'Codex session',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    ptyIdsByTabId: { 'tab-a': ['pty-a'] },
    terminalLayoutsByTabId: {
      'tab-a': {
        root: { type: 'leaf', leafId: AGENT_LEAF },
        activeLeafId: AGENT_LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [AGENT_LEAF]: 'pty-a' }
      }
    },
    agentStatusByPaneKey: {
      [paneKey]: {
        paneKey,
        state: 'done',
        prompt: '',
        updatedAt: Date.now(),
        stateStartedAt: Date.now(),
        agentType: 'codex',
        stateHistory: []
      }
    }
  })
}

export const PAGE_AGENT_TARGET = { tabId: 'tab-a', leafId: AGENT_LEAF }
