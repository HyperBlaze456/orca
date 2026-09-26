// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsChangedPayload } from '../../../../shared/filesystem-entry-types'
import { useAppStore } from '@/store'
import {
  PAGE_WORKTREE_PATH,
  deferred,
  makeFolderWorkspace,
  pageRpc,
  progressAnswer,
  resetPageStore,
  statusAnswer,
  stubPageApi,
  ticketsAnswer,
  type PageMethod
} from './trivium-page-test-harness'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import TriviumPage from './TriviumPage'

const { call, supports, subscribe } = vi.hoisted(() => ({
  call: vi.fn(),
  supports: vi.fn(),
  subscribe: vi.fn()
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: call,
  runtimeEnvironmentSupportsCapability: supports
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: subscribe
}))

let emitFsChange: ((payload: FsChangedPayload) => void) | null = null

function calls(method: PageMethod): number {
  return call.mock.calls.filter((entry) => entry[1] === method).length
}

function counts(): number[] {
  return [calls('trivium.status'), calls('trivium.tickets'), calls('trivium.progress')]
}

function header(): HTMLElement {
  return requireElement(document.querySelector('[data-trivium-header]'))
}

function staleNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-trivium-stale]')
}

async function renderLoadedPage(): Promise<void> {
  renderWithTooltips(<TriviumPage />)
  await screen.findByRole('tree', { name: 'Goals and tickets' })
  await waitFor(() =>
    expect(document.querySelector('[data-trivium-section="campaigns"]')).not.toBeNull()
  )
}

/** Nothing on screen reads as loading: no pending placeholder and no pulsing ring. */
function expectNothingLoading(): void {
  expect(document.querySelector('[data-trivium-pending]')).toBeNull()
  expect(document.querySelector('[data-trivium-section="progress-pending"]')).toBeNull()
  expect(document.querySelector('[data-trivium-reader] .animate-pulse')).toBeNull()
}

beforeEach(() => {
  call.mockReset()
  supports.mockReset().mockResolvedValue(true)
  emitFsChange = null
  subscribe
    .mockReset()
    .mockImplementation(
      async (_context: unknown, onPayload: (payload: FsChangedPayload) => void) => {
        emitFsChange = onPayload
        return () => {
          emitFsChange = null
        }
      }
    )
  resetPageStore()
  stubPageApi()
})
afterEach(cleanup)

describe('detail reads follow the status', () => {
  it('reads tickets and progress again when a harness file change brings a new status', async () => {
    call.mockImplementation(pageRpc())
    await renderLoadedPage()
    expect(counts()).toEqual([1, 1, 1])

    await act(async () => {
      emitFsChange?.({
        worktreePath: PAGE_WORKTREE_PATH,
        events: [
          { kind: 'update', absolutePath: `${PAGE_WORKTREE_PATH}/.trivium/ledger/current.json` }
        ]
      })
    })
    await waitFor(() => expect(counts()).toEqual([2, 2, 2]), { timeout: 3_000 })
  })

  it('keeps loaded details ready, never loading, while they are read again', async () => {
    call.mockImplementation(pageRpc())
    await renderLoadedPage()
    expectNothingLoading()

    const tickets = deferred<unknown>()
    const progress = deferred<unknown>()
    call.mockImplementation(
      pageRpc({
        'trivium.tickets': () => tickets.promise,
        'trivium.progress': () => progress.promise
      })
    )
    fireEvent.click(within(header()).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(counts()).toEqual([2, 2, 2]))

    // Both reads are in flight: the data already on screen must not turn back into placeholders.
    expectNothingLoading()
    expect(document.querySelector('[data-trivium-section="campaigns"]')).not.toBeNull()
    expect(staleNotice()).toBeNull()

    await act(async () => {
      tickets.resolve(ticketsAnswer())
      progress.resolve(progressAnswer())
    })
    expectNothingLoading()
  })

  it('does not reread the details when the status refresh fails, and rereads them after Retry', async () => {
    let offline = false
    call.mockImplementation(
      pageRpc({
        'trivium.status': async () => {
          if (offline) {
            throw new Error('Execution host is unreachable.')
          }
          return statusAnswer()
        }
      })
    )
    await renderLoadedPage()

    offline = true
    fireEvent.click(within(header()).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(staleNotice()).not.toBeNull())
    expect(counts()).toEqual([2, 1, 1])
    expectNothingLoading()
    expect(document.querySelector('[data-trivium-screen]')).toBeNull()

    offline = false
    fireEvent.click(within(requireElement(staleNotice())).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(counts()).toEqual([3, 2, 2]))
    await waitFor(() => expect(staleNotice()).toBeNull())
  })

  it('dates the notice by the older data when progress fails after tickets reloaded', async () => {
    let failProgress = false
    call.mockImplementation(
      pageRpc({
        'trivium.progress': async () => {
          if (failProgress) {
            throw new Error('The progress read timed out.')
          }
          return progressAnswer()
        }
      })
    )
    await renderLoadedPage()

    failProgress = true
    fireEvent.click(within(header()).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(staleNotice()).not.toBeNull())
    expect(requireElement(staleNotice())).toHaveTextContent(
      /^Can't reach Trivium\. Showing data from \d{2}:\d{2}\./
    )
    // Progress sections keep their data instead of "Couldn't load progress details."
    expect(document.querySelector('[data-trivium-pending="error"]')).toBeNull()
    expect(document.querySelector('[data-trivium-section="campaigns"]')).not.toBeNull()
  })
})

describe('hosts and workspaces', () => {
  it('reads nothing on a direct SSH host and says which host cannot serve Trivium', async () => {
    const host = 'ssh:build-box'
    const state = useAppStore.getState()
    useAppStore.setState({
      activeWorkspaceExecutionHostId: host,
      repos: [{ ...state.repos[0], connectionId: 'build-box' }],
      worktreesByRepo: { 'repo-1': [{ ...state.worktreesByRepo['repo-1'][0], hostId: host }] }
    })
    call.mockImplementation(pageRpc())
    renderWithTooltips(<TriviumPage />)
    const page = await waitFor(() =>
      requireElement(document.querySelector('[data-trivium-screen="unsupported"]'))
    )
    expect(page).toHaveTextContent(host)
    expect(call).not.toHaveBeenCalled()
    expect(header().querySelector('[data-trivium-state], [data-trivium-stale]')).toBeNull()
    expect(screen.queryByRole('tree')).toBeNull()
  })

  it('draws the full frame for a folder workspace with a harness and reads its details', async () => {
    const folderId = 'folder:notes-1'
    useAppStore.setState({
      activeWorktreeId: null,
      activeWorkspaceKey: folderId,
      folderWorkspaces: [makeFolderWorkspace('notes-1', '/srv/notes-folder')]
    })
    call.mockImplementation(pageRpc())
    await renderLoadedPage()
    for (const method of ['trivium.status', 'trivium.tickets', 'trivium.progress']) {
      expect(call).toHaveBeenCalledWith(
        { kind: 'local' },
        method,
        expect.objectContaining({ worktree: `id:${folderId}` }),
        expect.anything()
      )
    }
    expect(header().querySelector('[data-trivium-state="review"]')).not.toBeNull()
  })

  it('drops the previous workspace frame when the next workspace has no harness', async () => {
    const otherId = 'wt-2'
    const state = useAppStore.getState()
    const worktree = state.worktreesByRepo['repo-1'][0]
    useAppStore.setState({
      worktreesByRepo: {
        'repo-1': [
          worktree,
          { ...worktree, id: otherId, path: '/srv/other', isMainWorktree: false }
        ]
      }
    })
    const fixture = pageRpc()
    call.mockImplementation(
      async (target: unknown, method: string, params: { worktree: string }) =>
        method === 'trivium.status' && params.worktree === `id:${otherId}`
          ? statusAnswer((status) => ({ ...status, state: 'no-harness', harness_root: null }))
          : fixture(target, method)
    )
    await renderLoadedPage()
    const before = counts()

    await act(async () => {
      useAppStore.setState({
        activeWorktreeId: otherId,
        activeWorkspaceKey: `worktree:${otherId}`
      })
    })
    await waitFor(() =>
      expect(document.querySelector('[data-trivium-screen="no-harness"]')).not.toBeNull()
    )
    expect(screen.queryByRole('tree')).toBeNull()
    expect(header().querySelector('[data-trivium-state="no-harness"]')).not.toBeNull()
    expect(header().querySelector('[data-trivium-changes], [data-trivium-info]')).toBeNull()
    // Only the status of the second workspace was read; no details for a workspace without a harness.
    expect(counts()).toEqual([before[0] + 1, before[1], before[2]])
    expect(call).toHaveBeenLastCalledWith(
      { kind: 'local' },
      'trivium.status',
      { worktree: `id:${otherId}` },
      expect.anything()
    )
  })
})
