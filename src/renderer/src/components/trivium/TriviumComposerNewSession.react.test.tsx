// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID, getDefaultSettings } from '../../../../shared/constants'
import { isEphemeralSetupTerminalWorktreeId } from '../../../../shared/ephemeral-setup-terminal-worktree-id'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type * as LaunchAgentModule from '@/lib/launch-agent-in-new-tab'
import type {
  LaunchAgentInNewTabArgs,
  LaunchAgentInNewTabResult
} from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import { G2 } from './trivium-model-tables.fixture'
import {
  PAGE_WORKTREE_ID,
  deferred,
  makeFolderWorkspace,
  resetPageStore
} from './trivium-page-test-harness'
import { renderWithTooltips, requireElement, requireTextArea } from './trivium-reader-test-harness'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumComposer } from './TriviumComposer'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

const detection = vi.hoisted(() => {
  const box: { ids: TuiAgent[] | null } = { ids: null }
  return box
})
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({
    detectedIds: detection.ids,
    isLoading: detection.ids === null,
    detectionFailed: false,
    isRefreshing: false,
    refresh: async () => []
  })
}))

type LaunchAgentInNewTab = typeof LaunchAgentModule.launchAgentInNewTab
const launcher = vi.hoisted(() => {
  const box: {
    launch: ReturnType<typeof vi.fn<LaunchAgentInNewTab>>
    actual: LaunchAgentInNewTab | null
  } = { launch: vi.fn<LaunchAgentInNewTab>(), actual: null }
  return box
})
vi.mock('@/lib/launch-agent-in-new-tab', async (importOriginal) => {
  const actual = await importOriginal<typeof LaunchAgentModule>()
  launcher.actual = actual.launchAgentInNewTab
  return { ...actual, launchAgentInNewTab: launcher.launch }
})

// Stands in for the host: a launch that carries a prompt starts its agent through `agent.launchReplay`.
const hostRpc = vi.hoisted(() =>
  vi.fn<(target: unknown, method: string, params: Record<string, unknown>) => Promise<unknown>>()
)
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callRuntimeRpc: hostRpc
}))

// Stands in for the PTY: the real launch pastes the prompt once the agent is ready.
const paste = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agent-paste-draft', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pasteDraftWhenAgentReady: paste
}))

const focusTerminal = vi.hoisted(() => vi.fn())
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: focusTerminal }))

const { model } = makeReaderFixture()
const FOLDER_ID = 'folder:notes-1'
const NEW_LEAF = '44444444-4444-4444-8444-444444444444'
const OLD_LEAF = '55555555-5555-4555-8555-555555555555'

function composer(workspaceId = PAGE_WORKTREE_ID) {
  return (
    <TriviumComposer
      model={model}
      itemId={G2}
      workspaceId={workspaceId}
      sessionKey={workspaceId}
      inputRef={createRef<HTMLTextAreaElement>()}
    />
  )
}

function textbox(): HTMLTextAreaElement {
  return requireTextArea(screen.getByRole('textbox', { name: 'Message to the agent' }))
}

function note(): HTMLElement {
  return requireElement(document.querySelector('[data-trivium-composer-note]'))
}

function targetSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Agent session' })
}

async function type(text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(textbox(), { target: { value: text } })
  })
}

async function clickSend(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  })
}

function localLaunch(
  extra: Partial<NonNullable<LaunchAgentInNewTabResult>> = {}
): LaunchAgentInNewTabResult {
  return {
    surface: { kind: 'local-terminal', tabId: 'tab-new' },
    startupPlan: {
      agent: 'codex',
      launchCommand: 'codex',
      expectedProcess: 'codex',
      followupPrompt: null,
      launchConfig: { agentArgs: '', agentEnv: {} }
    },
    pasteDraftAfterLaunch: true,
    ...extra
  }
}

/** An agent pane in `tabId` that can take a request, as the hook server reports it. */
function seedSession(workspaceId: string, tabId: string, leafId: string, title: string): void {
  const paneKey = makePaneKey(tabId, leafId)
  const ptyId = `pty-${tabId}`
  useAppStore.setState((state) => ({
    tabsByWorktree: {
      ...state.tabsByWorktree,
      [workspaceId]: [
        ...(state.tabsByWorktree[workspaceId] ?? []).filter((tab) => tab.id !== tabId),
        {
          id: tabId,
          worktreeId: workspaceId,
          ptyId: null,
          title,
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    ptyIdsByTabId: { ...state.ptyIdsByTabId, [tabId]: [ptyId] },
    terminalLayoutsByTabId: {
      ...state.terminalLayoutsByTabId,
      [tabId]: {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leafId]: ptyId }
      }
    },
    agentStatusByPaneKey: {
      ...state.agentStatusByPaneKey,
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
  }))
}

beforeEach(() => {
  resetPageStore()
  send.mockReset().mockResolvedValue({ status: 'sent' })
  launcher.launch.mockReset().mockReturnValue(localLaunch())
  paste.mockReset().mockResolvedValue(true)
  focusTerminal.mockReset()
  detection.ids = ['claude', 'codex']
  useAppStore.setState({
    activeView: 'trivium',
    settings: { ...getDefaultSettings('/tmp'), defaultTuiAgent: 'codex' },
    folderWorkspaces: [makeFolderWorkspace('notes-1', '/srv/notes')],
    activeGroupIdByWorktree: { [PAGE_WORKTREE_ID]: 'group-main', [FOLDER_ID]: 'group-folder' }
  })
})
afterEach(cleanup)

describe('composer without an agent session', () => {
  it('preselects a new session of the default agent and can send', async () => {
    renderWithTooltips(composer())
    expect(targetSelect()).toBeEnabled()
    expect(targetSelect()).toHaveTextContent('New Codex session')
    expect(note()).toHaveTextContent(/^$/)
    await type('Plan this goal')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('starts the agent in a new tab of the workspace with the frozen prompt', async () => {
    renderWithTooltips(composer())
    await type('Plan this goal')
    textbox().focus()
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(launcher.launch).toHaveBeenCalledOnce()
    const args = launcher.launch.mock.calls[0][0]
    expect(args).toEqual({
      agent: 'codex',
      worktreeId: PAGE_WORKTREE_ID,
      groupId: 'group-main',
      prompt: expect.stringMatching(/Request:\nPlan this goal$/),
      promptDelivery: 'submit-after-ready',
      requestId: expect.any(String)
    })
    expect(args.prompt).toContain(`ID: ${G2}`)
    expect(send).not.toHaveBeenCalled()
    expect(useAppStore.getState().activeView).toBe('trivium')
    expect(focusTerminal).not.toHaveBeenCalled()
    expect(document.activeElement?.closest('[data-trivium-composer]')).not.toBeNull()
  })

  it('says it is starting, then that the request was sent, and clears the draft', async () => {
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launcher.launch.mockReturnValue(localLaunch({ promptDeliveryResult: delivery.promise }))
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent(/^Starting Codex…$/)
    expect(textbox()).toBeDisabled()
    expect(textbox().value).toBe('Plan this goal')

    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    expect(note()).toHaveTextContent(/^Sent to Codex\. It runs in a new tab of this workspace\.$/)
    expect(textbox().value).toBe('')
    expect(textbox()).toBeEnabled()
  })

  it('keeps the draft when the agent started but the request did not arrive', async () => {
    launcher.launch.mockReturnValue(
      localLaunch({
        promptDeliveryResult: Promise.resolve({ delivered: false, failureNotified: true })
      })
    )
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent(
      'Codex started, but the request was not delivered. Check the new tab in this workspace.'
    )
    expect(note().querySelector('.text-destructive')).not.toBeNull()
    expect(textbox().value).toBe('Plan this goal')
  })

  it('treats a failed delivery like an undelivered request', async () => {
    // Created at launch time, as the real delivery promise is, so it never sits unhandled.
    launcher.launch.mockImplementation(() =>
      localLaunch({ promptDeliveryResult: Promise.reject(new Error('pty gone')) })
    )
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent('Codex started, but the request was not delivered.')
    expect(textbox().value).toBe('Plan this goal')
  })

  it('without a delivery result, clears the draft only when the launch command carried it', async () => {
    launcher.launch.mockReturnValue(localLaunch({ pasteDraftAfterLaunch: false }))
    const view = renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent(/^Started Codex in this workspace\.$/)
    expect(textbox().value).toBe('')
    view.unmount()

    useTriviumSessionState.setState({ sessions: {} })
    launcher.launch.mockReturnValue(localLaunch({ pasteDraftAfterLaunch: true }))
    renderWithTooltips(composer())
    await type('Still pending')
    await clickSend()
    expect(note()).toHaveTextContent(/^Started Codex in this workspace\.$/)
    expect(textbox().value).toBe('Still pending')
  })

  it.each([
    ['returns nothing', () => launcher.launch.mockReturnValue(null)],
    [
      'throws',
      () =>
        launcher.launch.mockImplementation(() => {
          throw new Error('no shell')
        })
    ]
  ])('says it could not start when the launch %s and keeps the draft', async (_name, arrange) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    arrange()
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent(/^Could not start Codex\.$/)
    expect(textbox().value).toBe('Plan this goal')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    logged.mockRestore()
  })

  it('never launches twice while a launch is pending', async () => {
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launcher.launch.mockReturnValue(localLaunch({ promptDeliveryResult: delivery.promise }))
    renderWithTooltips(composer())
    await type('Only once')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    expect(launcher.launch).toHaveBeenCalledOnce()
  })

  it('selects the launched session once its agent shows up', async () => {
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(useTriviumSessionState.getState().sessions[PAGE_WORKTREE_ID]?.launchedTabId).toBe(
      'tab-new'
    )
    // Another agent reporting in first is not the launched one.
    await act(async () => seedSession(PAGE_WORKTREE_ID, 'tab-other', OLD_LEAF, 'Other session'))
    await act(async () => seedSession(PAGE_WORKTREE_ID, 'tab-new', NEW_LEAF, 'Codex (new)'))
    const session = useTriviumSessionState.getState().sessions[PAGE_WORKTREE_ID]
    expect(session?.target?.tabId).toBe('tab-new')
    expect(session?.newSessionAgent).toBeNull()
    expect(session?.launchedTabId).toBeNull()
    expect(targetSelect()).toHaveTextContent('Codex (new)')

    await type('Follow up')
    await clickSend()
    expect(launcher.launch).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0].noteTarget).toEqual({ tabId: 'tab-new', leafId: NEW_LEAF })
  })

  it('starts the agent in a folder workspace too', async () => {
    renderWithTooltips(composer(FOLDER_ID))
    await type('Plan this goal')
    await clickSend()
    expect(launcher.launch).toHaveBeenCalledOnce()
    expect(launcher.launch.mock.calls[0][0]).toMatchObject({
      agent: 'codex',
      worktreeId: FOLDER_ID,
      groupId: 'group-folder',
      promptDelivery: 'submit-after-ready'
    })
    expect(useAppStore.getState().activeView).toBe('trivium')
  })

  it('offers nothing to send to while agents are being detected', async () => {
    detection.ids = null
    renderWithTooltips(composer())
    await type('Plan this goal')
    expect(targetSelect()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(note()).toHaveTextContent(/^$/)
  })

  it('lets the user pick another agent to start', async () => {
    const user = userEvent.setup()
    renderWithTooltips(composer())
    await user.click(targetSelect())
    expect(screen.getByText('New session')).toBeInTheDocument()
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['New Codex session', 'New Claude session'])
    await user.click(screen.getByRole('option', { name: 'New Claude session' }))
    await type('Plan this goal')
    await clickSend()
    expect(launcher.launch.mock.calls[0][0]).toMatchObject({ agent: 'claude' })
  })
})

describe('composer with an agent session', () => {
  beforeEach(() => {
    seedSession(PAGE_WORKTREE_ID, 'tab-a', OLD_LEAF, 'Codex session')
    useAppStore.setState({ activeTabIdByWorktree: { [PAGE_WORKTREE_ID]: 'tab-a' } })
  })

  it('keeps the session as the default and lists new sessions after it', async () => {
    const user = userEvent.setup()
    renderWithTooltips(composer())
    expect(targetSelect()).toHaveTextContent('Codex session')
    await user.click(targetSelect())
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Codex session', 'New Codex session', 'New Claude session'])
  })

  it('sends to the session unless a new session is picked', async () => {
    const user = userEvent.setup()
    renderWithTooltips(composer())
    await type('To the session')
    await clickSend()
    expect(send).toHaveBeenCalledOnce()
    expect(launcher.launch).not.toHaveBeenCalled()

    await user.click(targetSelect())
    await user.click(screen.getByRole('option', { name: 'New Claude session' }))
    await type('To a new one')
    await clickSend()
    expect(send).toHaveBeenCalledOnce()
    expect(launcher.launch).toHaveBeenCalledOnce()
    expect(launcher.launch.mock.calls[0][0]).toMatchObject({ agent: 'claude' })
  })

  it.each([
    [null, 'Detecting agents…'],
    [[], 'No agents detected']
  ])('shows one disabled entry when detected agents are %j', async (ids, label) => {
    detection.ids = ids
    const user = userEvent.setup()
    renderWithTooltips(composer())
    await user.click(targetSelect())
    const status = screen.getByRole('option', { name: label })
    expect(status).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })
})

describe('composer launch with the real store', () => {
  beforeEach(() => {
    launcher.launch.mockImplementation(
      (args: LaunchAgentInNewTabArgs) => launcher.actual?.(args) ?? null
    )
    hostRpc.mockReset().mockImplementation(async (_target, _method, params) => ({
      outcome: { kind: 'terminal', handle: 'term_1', paneKey: String(params.paneKey) },
      worktreeId: String(params.worktreeId ?? ''),
      receipt: { mode: 'terminal', preferred: 'terminal', reason: 'user_default', detail: 'x' }
    }))
    detection.ids = ['claude']
  })

  function tabOwners(tabId: string): string[] {
    return Object.entries(useAppStore.getState().tabsByWorktree)
      .filter(([, tabs]) => tabs.some((tab) => tab.id === tabId))
      .map(([worktreeId]) => worktreeId)
  }

  it.each([
    ['a git worktree', PAGE_WORKTREE_ID],
    ['a folder workspace', FOLDER_ID]
  ])('puts the new tab in %s and stays on the page', async (_name, workspaceId) => {
    renderWithTooltips(composer(workspaceId))
    await type('Plan this goal')
    await clickSend()
    const launched = launcher.launch.mock.results[0]
    const result = launched?.type === 'return' ? launched.value : null
    const tabId = result?.surface.kind === 'local-terminal' ? result.surface.tabId : null
    expect(tabId).not.toBeNull()
    expect(tabOwners(tabId ?? '')).toEqual([workspaceId])
    const owners = Object.keys(useAppStore.getState().tabsByWorktree)
    expect(owners).not.toContain(FLOATING_TERMINAL_WORKTREE_ID)
    expect(owners.some(isEphemeralSetupTerminalWorktreeId)).toBe(false)
    expect(useAppStore.getState().activeView).toBe('trivium')
    expect(focusTerminal).not.toHaveBeenCalled()
    expect(paste).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(note()).toHaveTextContent('Sent to Claude. It runs in a new tab of this workspace.')
    )
    expect(textbox().value).toBe('')
  })
})
