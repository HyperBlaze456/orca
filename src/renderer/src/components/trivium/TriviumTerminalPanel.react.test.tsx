// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalPaneProps } from '@/components/terminal-pane/terminal-pane-types'
import { PASTE_TERMINAL_TEXT_EVENT, type PasteTerminalTextDetail } from '@/constants/terminal'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { fixtureApproveCommand } from './trivium-model-tables.fixture'
import {
  PAGE_WORKTREE_ID,
  PAGE_WORKTREE_PATH,
  pageRpc,
  resetPageStore,
  stubPageApi
} from './trivium-page-test-harness'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import { TRIVIUM_TERMINAL_READY_TIMEOUT_MS } from './trivium-terminal-command-insert'
import { TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY } from './trivium-terminal-panel-height'
import {
  TRIVIUM_TERMINAL_OPEN_STORAGE_KEY,
  triviumTerminalWorktreeId
} from './trivium-terminal-panel-state'
import TriviumPage from './TriviumPage'
import type * as ActiveWorkspaceModule from './use-trivium-active-workspace'

const { call, supports, paneMock, workspaceMock } = vi.hoisted(() => ({
  call: vi.fn(),
  supports: vi.fn(),
  /** `ready: false` draws a pane whose PTY never appears. */
  paneMock: { ready: true },
  /** Makes the active workspace's SSH owner unresolved (`connectionId: undefined`). */
  workspaceMock: { unresolved: false }
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
      data-worktree-id={props.worktreeId}
      data-cwd={props.cwd}
      data-visible={String(props.isVisible)}
      data-active={String(props.isActive)}
    >
      {paneMock.ready ? (
        <div className="xterm">
          <div data-pty-id="pty-1" />
          <div className="xterm-rows">$</div>
          <textarea aria-label="Terminal input" className="xterm-helper-textarea" />
        </div>
      ) : null}
      <button type="button" onClick={() => props.onPtyExit('pty-1', 0)}>
        exit shell
      </button>
    </div>
  )
}))
vi.mock('./use-trivium-active-workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof ActiveWorkspaceModule>()
  return {
    ...actual,
    useTriviumActiveWorkspace: () => {
      const workspace = actual.useTriviumActiveWorkspace()
      return workspace && workspaceMock.unresolved
        ? { ...workspace, connectionId: undefined }
        : workspace
    }
  }
})

const CANDIDATE = 'ticket.trim-keeps-marker'
const createTab = vi.fn<AppState['createTab']>()
const closeTab = vi.fn<AppState['closeTab']>()

beforeEach(() => {
  call.mockReset().mockImplementation(pageRpc())
  supports.mockReset().mockResolvedValue(true)
  paneMock.ready = true
  workspaceMock.unresolved = false
  resetPageStore()
  stubPageApi()
  const realCreateTab = useAppStore.getState().createTab
  createTab.mockReset().mockImplementation(realCreateTab)
  closeTab.mockReset()
  useAppStore.setState({ createTab, closeTab })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function header(): HTMLElement {
  return requireElement(document.querySelector('[data-trivium-header]'))
}

function toggle(): HTMLElement {
  return within(header()).getByRole('button', { name: 'Terminal' })
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-trivium-terminal-panel]')
}

function pane(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="terminal-pane"]')
}

function createdTabIds(): string[] {
  return createTab.mock.results.map((result) =>
    result.type === 'return' ? result.value.id : 'failed'
  )
}

async function renderPage(): Promise<ReturnType<typeof renderWithTooltips>> {
  const view = renderWithTooltips(<TriviumPage />)
  await screen.findByRole('tree', { name: 'Goals and tickets' })
  return view
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

describe('terminal panel toggle', () => {
  it('creates one shell on first open, keeps it while hidden, and remembers the choice', async () => {
    await renderPage()
    expect(panel()).toBeNull()
    expect(createTab).not.toHaveBeenCalled()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    expect(createTab).toHaveBeenCalledTimes(1)
    // Branded, and carrying the workspace root main anchors the shell's cwd to.
    const shellId = `ephemeral-setup-terminal:trivium-terminal::${PAGE_WORKTREE_PATH}`
    expect(triviumTerminalWorktreeId(PAGE_WORKTREE_PATH)).toBe(shellId)
    expect(createTab).toHaveBeenCalledWith(
      shellId,
      undefined,
      undefined,
      expect.objectContaining({ activate: false, recordInteraction: false })
    )
    const [tabId] = createdTabIds()
    const shown = requireElement(pane())
    expect(shown).toHaveAttribute('data-terminal-tab-id', tabId)
    expect(shown).toHaveAttribute('data-worktree-id', shellId)
    expect(shown).toHaveAttribute('data-cwd', PAGE_WORKTREE_PATH)
    expect(shown).toHaveAttribute('data-visible', 'true')
    expect(shown).toHaveAttribute('data-active', 'true')
    expect(requireElement(panel())).not.toHaveClass('hidden')
    expect(requireElement(panel())).toHaveTextContent(PAGE_WORKTREE_PATH)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY)).toBe('true')
    // The ephemeral tab lives under its own id, never in the workspace's tab strip.
    expect(useAppStore.getState().tabsByWorktree[PAGE_WORKTREE_ID] ?? []).toHaveLength(0)

    fireEvent.click(within(requireElement(panel())).getByRole('button', { name: 'Hide terminal' }))
    expect(requireElement(panel())).toHaveClass('hidden')
    expect(pane()).toHaveAttribute('data-visible', 'false')
    expect(pane()).toHaveAttribute('data-terminal-tab-id', tabId)
    expect(localStorage.getItem(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY)).toBe('false')
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle())
    expect(pane()).toHaveAttribute('data-visible', 'true')
    expect(createTab).toHaveBeenCalledTimes(1)
    expect(closeTab).not.toHaveBeenCalled()
  })

  it('reopens on the next visit when it was left open', async () => {
    localStorage.setItem(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY, 'true')
    await renderPage()
    await waitFor(() => expect(pane()).toHaveAttribute('data-visible', 'true'))
    expect(createTab).toHaveBeenCalledTimes(1)
  })

  it('resizes from the separator with the arrow keys and keeps the height', async () => {
    localStorage.setItem(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY, 'true')
    await renderPage()
    const separator = screen.getByRole('separator', { name: 'Resize the terminal' })
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
    expect(separator).toHaveAttribute('aria-valuenow', '280')
    fireEvent.keyDown(separator, { key: 'ArrowUp' })
    expect(separator).toHaveAttribute('aria-valuenow', '296')
    fireEvent.keyDown(separator, { key: 'ArrowDown', shiftKey: true })
    expect(separator).toHaveAttribute('aria-valuenow', '232')
    expect(requireElement(panel()).style.height).toBe('232px')
    expect(localStorage.getItem(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY)).toBe('232')
  })
})

describe('terminal panel lifetime', () => {
  it('keeps the page open when Escape is pressed inside the terminal', async () => {
    const close = vi.fn()
    useAppStore.setState({ closeTriviumPage: close })
    await renderPage()
    fireEvent.click(toggle())
    const input = await screen.findByRole('textbox', { name: 'Terminal input' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes the shell when the page unmounts', async () => {
    const view = await renderPage()
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    const [tabId] = createdTabIds()
    view.unmount()
    expect(closeTab).toHaveBeenCalledTimes(1)
    expect(closeTab).toHaveBeenCalledWith(tabId, { recordInteraction: false, reason: 'cleanup' })
  })

  it('replaces the shell when the workspace changes, and waits for a hidden panel to open', async () => {
    const [first] = useAppStore.getState().worktreesByRepo['repo-1'] ?? []
    const other = { ...first, id: 'wt-2', path: '/srv/other', displayName: 'other' }
    const third = { ...first, id: 'wt-3', path: '/srv/third', displayName: 'third' }
    useAppStore.setState({ worktreesByRepo: { 'repo-1': [first, other, third] } })
    await renderPage()
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    const [firstTab] = createdTabIds()

    act(() => {
      useAppStore.setState({ activeWorktreeId: 'wt-2', activeWorkspaceKey: 'worktree:wt-2' })
    })
    await waitFor(() => expect(pane()).toHaveAttribute('data-cwd', '/srv/other'))
    expect(closeTab).toHaveBeenCalledWith(firstTab, {
      recordInteraction: false,
      reason: 'cleanup'
    })
    expect(createTab).toHaveBeenCalledTimes(2)
    const secondTab = createdTabIds()[1]

    fireEvent.click(within(requireElement(panel())).getByRole('button', { name: 'Hide terminal' }))
    act(() => {
      useAppStore.setState({ activeWorktreeId: 'wt-3', activeWorkspaceKey: 'worktree:wt-3' })
    })
    await waitFor(() =>
      expect(closeTab).toHaveBeenCalledWith(secondTab, {
        recordInteraction: false,
        reason: 'cleanup'
      })
    )
    expect(pane()).toBeNull()
    expect(createTab).toHaveBeenCalledTimes(2)
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).toHaveAttribute('data-cwd', '/srv/third'))
    expect(createTab).toHaveBeenCalledTimes(3)
  })

  it('says the shell exited and starts a new one on request', async () => {
    await renderPage()
    fireEvent.click(toggle())
    await waitFor(() => expect(pane()).not.toBeNull())
    const [firstTab] = createdTabIds()

    fireEvent.click(screen.getByRole('button', { name: 'exit shell' }))
    const exited = requireElement(document.querySelector('[data-trivium-terminal-exited]'))
    expect(exited).toHaveTextContent('The shell exited.')
    expect(pane()).toBeNull()
    expect(closeTab).toHaveBeenCalledTimes(1)
    expect(closeTab).toHaveBeenCalledWith(firstTab, {
      recordInteraction: false,
      reason: 'pty-exit'
    })

    fireEvent.click(within(exited).getByRole('button', { name: 'Start a new shell' }))
    await waitFor(() => expect(pane()).not.toBeNull())
    expect(createTab).toHaveBeenCalledTimes(2)
    const secondTab = createdTabIds()[1]
    expect(secondTab).not.toBe(firstTab)
    expect(pane()).toHaveAttribute('data-terminal-tab-id', secondTab)
    expect(closeTab).toHaveBeenCalledTimes(1)
  })
})

describe('terminal availability', () => {
  it('disables the toggle for an SSH workspace and never creates a shell', async () => {
    localStorage.setItem(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY, 'true')
    const repos = useAppStore.getState().repos.map((repo) => ({ ...repo, connectionId: 'ssh-1' }))
    useAppStore.setState({ repos })
    renderWithTooltips(<TriviumPage />)
    const button = await waitFor(() => toggle())
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    fireEvent.focus(requireElement(button.parentElement))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'The terminal is available for local workspaces only.'
    )
    expect(panel()).toBeNull()
    expect(createTab).not.toHaveBeenCalled()
  })

  it('disables the toggle and the paste button while the SSH owner is unresolved', async () => {
    workspaceMock.unresolved = true
    await renderPage()
    expect(toggle()).toBeDisabled()
    const callout = await openCandidateTicket()
    const paste = within(callout).getByRole('button', { name: 'Paste into terminal' })
    expect(paste).toBeDisabled()
    fireEvent.click(paste)
    expect(panel()).toBeNull()
    expect(createTab).not.toHaveBeenCalled()
  })
})

describe('Paste into terminal', () => {
  it('opens the panel and pastes the approve command once, without Enter', async () => {
    const pasted: PasteTerminalTextDetail[] = []
    const onPaste = (event: Event): void => {
      if (event instanceof CustomEvent) {
        pasted.push(event.detail)
      }
    }
    window.addEventListener(PASTE_TERMINAL_TEXT_EVENT, onPaste)
    try {
      await renderPage()
      const callout = await openCandidateTicket()
      const command = fixtureApproveCommand(CANDIDATE)
      expect(
        within(callout)
          .getAllByRole('button')
          .map((button) => button.textContent)
      ).toEqual(['Paste into terminal', 'Ask the agent to approve', 'Copy command'])
      expect(
        requireElement(callout.querySelector('[data-trivium-approve-placeholders]'))
      ).toHaveTextContent('Replace <user> before you press Enter.')

      fireEvent.click(within(callout).getByRole('button', { name: 'Paste into terminal' }))
      await waitFor(() => expect(pasted).toHaveLength(1))
      const [tabId] = createdTabIds()
      expect(createTab).toHaveBeenCalledTimes(1)
      expect(pasted[0]).toEqual({ tabId, text: command })
      expect(pasted[0].text).not.toMatch(/[\r\n]/)
      expect(pane()).toHaveAttribute('data-visible', 'true')
      expect(focusTerminalTabSurface).toHaveBeenCalledWith(tabId)
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(pasted).toHaveLength(1)
    } finally {
      window.removeEventListener(PASTE_TERMINAL_TEXT_EVENT, onPaste)
    }
  })

  it('says so when the shell does not start in time', async () => {
    paneMock.ready = false
    const pasted = vi.fn()
    window.addEventListener(PASTE_TERMINAL_TEXT_EVENT, pasted)
    try {
      await renderPage()
      const callout = await openCandidateTicket()
      vi.useFakeTimers()
      fireEvent.click(within(callout).getByRole('button', { name: 'Paste into terminal' }))
      await act(async () => {
        vi.advanceTimersByTime(TRIVIUM_TERMINAL_READY_TIMEOUT_MS + 200)
      })
      expect(callout).toHaveTextContent(
        "The terminal didn't start in time. Try again, or copy the command."
      )
      expect(pasted).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(PASTE_TERMINAL_TEXT_EVENT, pasted)
    }
  })
})
