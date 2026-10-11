// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID, getDefaultSettings } from '../../../../shared/constants'
import { resolveTerminalStartupCwdForWorkspace } from '../../../../shared/terminal-startup-cwd'
import {
  getRepoIdFromWorktreeId,
  splitWorktreeIdForFilesystem
} from '../../../../shared/worktree/id'
import type { TerminalPaneProps } from '@/components/terminal-pane/terminal-pane-types'
import { PASTE_TERMINAL_TEXT_EVENT, type PasteTerminalTextDetail } from '@/constants/terminal'
import { toRuntimeTerminalWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { fixtureApproveCommand } from './trivium-model-tables.fixture'
import {
  makeFolderWorkspace,
  pageRpc,
  resetPageStore,
  stubPageApi
} from './trivium-page-test-harness'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import { triviumCommandPlaceholders } from './trivium-terminal-command-insert'
import { TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY } from './trivium-terminal-panel-height'
import {
  TRIVIUM_TERMINAL_OPEN_STORAGE_KEY,
  triviumTerminalWorktreeId
} from './trivium-terminal-panel-state'
import TriviumPage from './TriviumPage'

// Verifier edge cases for WO-5: lifetimes under StrictMode, stale pastes, laziness, availability
// of normal local workspaces, clamping, and the branded id's parse for unusual paths.

const { call, supports, paneMock } = vi.hoisted(() => ({
  call: vi.fn(),
  supports: vi.fn(),
  paneMock: { ready: true }
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: call,
  runtimeEnvironmentSupportsCapability: supports
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: vi.fn(async () => () => {})
}))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: vi.fn() }))
vi.mock('@/components/terminal-pane/TerminalPane', () => ({
  default: (props: TerminalPaneProps) => (
    <div
      data-testid="terminal-pane"
      data-terminal-tab-id={props.tabId}
      data-cwd={props.cwd}
      data-visible={String(props.isVisible)}
    >
      {paneMock.ready ? (
        <div className="xterm">
          <div data-pty-id="pty-1" />
          <div className="xterm-rows">$</div>
        </div>
      ) : null}
      <button type="button" onClick={() => props.onPtyExit('pty-1', 0)}>
        exit shell
      </button>
    </div>
  )
}))

const CANDIDATE = 'ticket.trim-keeps-marker'
const createTab = vi.fn<AppState['createTab']>()
const closeTab = vi.fn<AppState['closeTab']>()
const pasted: PasteTerminalTextDetail[] = []
const onPaste = (event: Event): void => {
  if (event instanceof CustomEvent) {
    pasted.push(event.detail)
  }
}

beforeEach(() => {
  call.mockReset().mockImplementation(pageRpc())
  supports.mockReset().mockResolvedValue(true)
  paneMock.ready = true
  resetPageStore()
  stubPageApi()
  const realCreateTab = useAppStore.getState().createTab
  createTab.mockReset().mockImplementation(realCreateTab)
  closeTab.mockReset()
  useAppStore.setState({ createTab, closeTab })
  pasted.length = 0
  window.addEventListener(PASTE_TERMINAL_TEXT_EVENT, onPaste)
})
afterEach(() => {
  window.removeEventListener(PASTE_TERMINAL_TEXT_EVENT, onPaste)
  cleanup()
  vi.useRealTimers()
})

function toggle(): HTMLElement {
  const header = requireElement(document.querySelector('[data-trivium-header]'))
  return within(header).getByRole('button', { name: 'Terminal' })
}

function pane(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="terminal-pane"]')
}

function createdTabIds(): string[] {
  return createTab.mock.results.map((result) =>
    result.type === 'return' ? result.value.id : 'failed'
  )
}

function closedTabIds(): string[] {
  return closeTab.mock.calls.map(([tabId]) => tabId)
}

async function openCandidateTicket(): Promise<HTMLElement> {
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Trivium views' })).getByRole('button', {
      name: /^All tickets/
    })
  )
  const row = await waitFor(() =>
    requireElement(document.querySelector(`[data-trivium-ticket-row="${CANDIDATE}"]`))
  )
  fireEvent.click(row)
  return waitFor(() =>
    requireElement(
      document.querySelector(
        `[data-trivium-page="ticket"][data-trivium-item="${CANDIDATE}"] [data-trivium-approval]`
      )
    )
  )
}

function addWorktree(id: string, path: string): void {
  const [first] = useAppStore.getState().worktreesByRepo['repo-1'] ?? []
  const current = useAppStore.getState().worktreesByRepo['repo-1'] ?? []
  useAppStore.setState({
    worktreesByRepo: { 'repo-1': [...current, { ...first, id, path, displayName: id }] }
  })
}

function activate(id: string): void {
  act(() => {
    useAppStore.setState({ activeWorktreeId: id, activeWorkspaceKey: `worktree:${id}` })
  })
}

describe('shell lifetime under StrictMode', () => {
  it('leaves exactly one live shell and closes every tab it created on unmount', async () => {
    const view = renderWithTooltips(
      <StrictMode>
        <TriviumPage />
      </StrictMode>
    )
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    const created = createdTabIds()
    const live = requireElement(pane()).dataset.terminalTabId
    expect(created).toContain(live)
    // Every created tab other than the one on screen is already closed: no invisible shells.
    expect(created.filter((id) => id !== live).sort()).toEqual(closedTabIds().sort())
    view.unmount()
    expect(closedTabIds().sort()).toEqual(created.sort())
  })

  it('pastes once under StrictMode', async () => {
    renderWithTooltips(
      <StrictMode>
        <TriviumPage />
      </StrictMode>
    )
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    const callout = await openCandidateTicket()
    fireEvent.click(within(callout).getByRole('button', { name: 'Paste into terminal' }))
    await waitFor(() => expect(pasted).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(pasted).toHaveLength(1)
    expect(pasted[0].tabId).toBe(requireElement(pane()).dataset.terminalTabId)
  })
})

describe('paste requests', () => {
  it('pastes once for a quick double click', async () => {
    renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    const callout = await openCandidateTicket()
    const paste = within(callout).getByRole('button', { name: 'Paste into terminal' })
    fireEvent.click(paste)
    fireEvent.click(paste)
    await waitFor(() => expect(pasted).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(pasted).toHaveLength(1)
  })

  it('pastes into the new shell, not the exited one', async () => {
    renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    const [firstTab] = createdTabIds()
    fireEvent.click(screen.getByRole('button', { name: 'exit shell' }))
    expect(document.querySelector('[data-trivium-terminal-exited]')).not.toBeNull()
    const callout = await openCandidateTicket()
    fireEvent.click(within(callout).getByRole('button', { name: 'Paste into terminal' }))
    await waitFor(() => expect(pasted).toHaveLength(1))
    const secondTab = createdTabIds()[1]
    expect(secondTab).toBeDefined()
    expect(pasted[0]).toEqual({ tabId: secondTab, text: fixtureApproveCommand(CANDIDATE) })
    expect(pasted[0].tabId).not.toBe(firstTab)
  })

  it('never pastes after the page unmounts mid-wait and leaves no timer behind', async () => {
    paneMock.ready = false
    const view = renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    const callout = await openCandidateTicket()
    vi.useFakeTimers()
    fireEvent.click(within(callout).getByRole('button', { name: 'Paste into terminal' }))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    paneMock.ready = true
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(pasted).toHaveLength(0)
  })

  it('drops a pending paste when the workspace changes, even after coming back', async () => {
    paneMock.ready = false
    addWorktree('wt-2', '/srv/other')
    renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    const callout = await openCandidateTicket()
    fireEvent.click(within(callout).getByRole('button', { name: 'Paste into terminal' }))
    await waitFor(() => expect(pane()).not.toBeNull())
    activate('wt-2')
    await waitFor(() => expect(pane()).toHaveAttribute('data-cwd', '/srv/other'))
    paneMock.ready = true
    activate('wt-1')
    await waitFor(() => expect(pane()).toHaveAttribute('data-cwd', '/srv/acme'))
    // Nobody clicked Paste in this visit: the old request must not land in the fresh shell.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(pasted).toHaveLength(0)
  })
})

describe('lazy shell', () => {
  it('does not start a shell when returning to a workspace whose panel is hidden', async () => {
    addWorktree('wt-2', '/srv/other')
    renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Hide terminal' }))
    activate('wt-2')
    await waitFor(() => expect(closeTab).toHaveBeenCalledTimes(1))
    activate('wt-1')
    await new Promise((resolve) => setTimeout(resolve, 100))
    // The panel stayed hidden the whole time, so no second shell should exist.
    expect(createTab).toHaveBeenCalledTimes(1)
    expect(pane()).toBeNull()
  })
})

describe('availability of ordinary local workspaces', () => {
  it('is available for a local folder workspace and anchors the shell to the folder', async () => {
    useAppStore.setState({
      activeWorktreeId: null,
      activeWorkspaceKey: 'folder:notes-1',
      folderWorkspaces: [makeFolderWorkspace('notes-1', '/srv/notes folder')]
    })
    renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    expect(toggle()).toBeEnabled()
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).toHaveAttribute('data-cwd', '/srv/notes folder'))
    expect(createTab).toHaveBeenCalledWith(
      'ephemeral-setup-terminal:trivium-terminal::/srv/notes folder',
      undefined,
      undefined,
      expect.objectContaining({ activate: false, recordInteraction: false })
    )
  })

  it('is available for a local worktree before the active host id is recorded', async () => {
    useAppStore.setState({ activeWorkspaceExecutionHostId: null })
    renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree', { name: 'Goals and tickets' })
    expect(toggle()).toBeEnabled()
  })

  it('stays off while a remote runtime is focused, since the setup-terminal id would spawn there', async () => {
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: 'rt-1' },
      runtimeEnvironments: [
        {
          id: 'rt-1',
          name: 'Remote Mac',
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: null,
          runtimeId: null,
          endpoints: [{ id: 'e-1', kind: 'websocket', label: 'LAN', endpoint: 'ws://remote' }],
          preferredEndpointId: 'e-1'
        }
      ]
    })
    renderWithTooltips(<TriviumPage />)
    await waitFor(() => expect(toggle()).toBeDisabled())
    fireEvent.focus(requireElement(toggle().parentElement))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'The terminal is unavailable while a remote runtime is active.'
    )
    expect(createTab).not.toHaveBeenCalled()
  })

  it('is available on a page whose status read failed', async () => {
    call.mockImplementation(
      pageRpc({
        'trivium.status': async () => {
          throw new Error('Execution host is unreachable.')
        }
      })
    )
    renderWithTooltips(<TriviumPage />)
    await waitFor(() => expect(toggle()).toBeEnabled())
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).toHaveAttribute('data-cwd', '/srv/acme'))
  })
})

describe('height on a short window', () => {
  it('clamps at render and keeps the stored height', async () => {
    localStorage.setItem(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY, 'true')
    localStorage.setItem(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY, '600')
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 400
    })
    try {
      renderWithTooltips(<TriviumPage />)
      const separator = await screen.findByRole('separator', { name: 'Resize the terminal' })
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '280'))
      expect(separator).toHaveAttribute('aria-valuemax', '280')
      fireEvent.keyDown(separator, { key: 'ArrowUp' })
      expect(localStorage.getItem(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY)).toBe('600')
    } finally {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', descriptor)
      }
    }
  })
})

describe('branded shell id for unusual workspace paths', () => {
  const paths = [
    '/srv/acme',
    '/Users/me/my repo',
    '/Users/me/작업 공간/리포',
    '/srv/odd::name/repo',
    'C:\\Users\\me\\repo',
    '\\\\wsl.localhost\\Ubuntu\\home\\me\\repo'
  ]
  for (const path of paths) {
    it(`anchors the startup cwd to ${JSON.stringify(path)}`, () => {
      const id = triviumTerminalWorktreeId(path)
      expect(getRepoIdFromWorktreeId(id)).toBe('ephemeral-setup-terminal:trivium-terminal')
      expect(splitWorktreeIdForFilesystem(id)?.worktreePath).toBe(path)
      // Main gives the shell the same startup cwd a real worktree terminal at this path gets
      // (Windows separators are normalised there for every terminal), never HOME.
      const cwd = resolveTerminalStartupCwdForWorkspace({ workspaceId: id, requestedCwd: path })
      expect(cwd).toBeDefined()
      expect(cwd).toBe(
        resolveTerminalStartupCwdForWorkspace({
          workspaceId: `repo-1::${path}`,
          requestedCwd: path
        })
      )
      // A remote runtime would still see only the floating scope, never the local path.
      expect(toRuntimeTerminalWorktreeSelector(id)).toBe(
        toRuntimeTerminalWorktreeSelector(FLOATING_TERMINAL_WORKTREE_ID)
      )
    })
  }
})

describe('placeholder hint', () => {
  it('names each placeholder once and ignores shell redirections', () => {
    expect(triviumCommandPlaceholders('x --by <user> --as <user> --why <reason>')).toEqual([
      '<user>',
      '<reason>'
    ])
    expect(triviumCommandPlaceholders('cmd 2>&1 < in.txt > out.txt')).toEqual([])
  })
})
