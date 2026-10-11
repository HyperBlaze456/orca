// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type * as LaunchAgentModule from '@/lib/launch-agent-in-new-tab'
import type { LaunchAgentInNewTabResult } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import { G1_SYNC, G2 } from './trivium-model-tables.fixture'
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

// Verifier (WO-6 r1): races, workspace switches, unmounts and copy edges of new-session launch.

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
const launch = vi.hoisted(() => vi.fn<LaunchAgentInNewTab>())
vi.mock('@/lib/launch-agent-in-new-tab', async (importOriginal) => ({
  ...(await importOriginal<typeof LaunchAgentModule>()),
  launchAgentInNewTab: launch
}))

const { model } = makeReaderFixture()
const FOLDER_ID = 'folder:notes-1'
const NEW_LEAF = '44444444-4444-4444-8444-444444444444'
const OLD_LEAF = '55555555-5555-4555-8555-555555555555'

function composer(workspaceId = PAGE_WORKTREE_ID, itemId = G2) {
  return (
    <TriviumComposer
      model={model}
      itemId={itemId}
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

function sendButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Send' })
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
    fireEvent.click(sendButton())
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

function sessionOf(key: string) {
  return useTriviumSessionState.getState().sessions[key]
}

beforeEach(() => {
  resetPageStore()
  send.mockReset().mockResolvedValue({ status: 'sent' })
  launch.mockReset().mockReturnValue(localLaunch())
  detection.ids = ['claude', 'codex']
  useAppStore.setState({
    activeView: 'trivium',
    settings: { ...getDefaultSettings('/tmp'), defaultTuiAgent: 'codex' },
    folderWorkspaces: [makeFolderWorkspace('notes-1', '/srv/notes')],
    activeGroupIdByWorktree: { [PAGE_WORKTREE_ID]: 'group-main', [FOLDER_ID]: 'group-folder' }
  })
})
afterEach(cleanup)

describe('launch arguments', () => {
  it('passes only the contract fields: no launchSource, no view or focus options', async () => {
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(Object.keys(launch.mock.calls[0][0]).sort()).toEqual([
      'agent',
      'groupId',
      'prompt',
      'promptDelivery',
      'requestId',
      'worktreeId'
    ])
  })

  it('omits the group when the workspace has no active group', async () => {
    useAppStore.setState({ activeGroupIdByWorktree: {} })
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(launch.mock.calls[0][0].groupId).toBeUndefined()
  })

  it('builds the same prompt a send to an existing session builds', async () => {
    seedSession(PAGE_WORKTREE_ID, 'tab-a', OLD_LEAF, 'Codex session')
    const user = userEvent.setup()
    renderWithTooltips(composer())
    await type('Same words')
    await clickSend()
    const sentPrompt = send.mock.calls[0][0].prompt

    await user.click(targetSelect())
    await user.click(screen.getByRole('option', { name: 'New Claude session' }))
    await type('Same words')
    await clickSend()
    expect(launch.mock.calls[0][0].prompt).toBe(sentPrompt)
  })

  it('does not launch on Shift+Enter or on an IME-owned Enter', async () => {
    renderWithTooltips(composer())
    await type('Plan this goal')
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, shiftKey: true })
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 229, isComposing: true })
    })
    expect(launch).not.toHaveBeenCalled()
  })
})

describe('target list in the rendered select', () => {
  it('preselects the first detected agent when the default agent is not detected', () => {
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp'), defaultTuiAgent: 'opencode' }
    })
    renderWithTooltips(composer())
    expect(targetSelect()).toHaveTextContent('New Claude session')
  })

  it('hides agents the user disabled', async () => {
    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/tmp'),
        defaultTuiAgent: 'codex',
        disabledTuiAgents: ['codex']
      }
    })
    const user = userEvent.setup()
    renderWithTooltips(composer())
    expect(targetSelect()).toHaveTextContent('New Claude session')
    await user.click(targetSelect())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'New Claude session'
    ])
  })

  it('is disabled with no session and no detected agent, and Send stays off', async () => {
    detection.ids = []
    renderWithTooltips(composer())
    await type('Plan this goal')
    expect(targetSelect()).toBeDisabled()
    expect(sendButton()).toBeDisabled()
    expect(note()).toHaveTextContent(/^$/)
  })
})

describe('launch state across navigation', () => {
  it('keeps the outcome after the composer unmounts mid-launch', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launch.mockReturnValue(localLaunch({ promptDeliveryResult: delivery.promise }))
    const view = renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    view.unmount()
    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    renderWithTooltips(composer())
    expect(note()).toHaveTextContent(/^Sent to Codex\. It runs in a new tab of this workspace\.$/)
    expect(textbox().value).toBe('')
    expect(textbox()).toBeEnabled()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('does not leak a pending launch or its outcome into another workspace', async () => {
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launch.mockReturnValue(localLaunch({ promptDeliveryResult: delivery.promise }))
    const view = renderWithTooltips(composer())
    await type('For the worktree')
    await clickSend()
    expect(note()).toHaveTextContent('Starting Codex…')

    view.rerender(composer(FOLDER_ID))
    expect(note()).toHaveTextContent(/^$/)
    expect(textbox()).toBeEnabled()
    expect(textbox().value).toBe('')
    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    expect(note()).toHaveTextContent(/^$/)
    expect(sessionOf(PAGE_WORKTREE_ID)?.notice).toBe(
      'Sent to Codex. It runs in a new tab of this workspace.'
    )
    expect(sessionOf(PAGE_WORKTREE_ID)?.draft).toBe('')
    expect(sessionOf(FOLDER_ID)?.notice ?? null).toBeNull()
  })

  it('keeps the frozen prompt when the item changes while the launch is pending', async () => {
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launch.mockReturnValue(localLaunch({ promptDeliveryResult: delivery.promise }))
    const view = renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    const prompt = launch.mock.calls[0][0].prompt
    const otherItem = G1_SYNC
    view.rerender(composer(PAGE_WORKTREE_ID, otherItem))
    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    expect(launch).toHaveBeenCalledOnce()
    expect(launch.mock.calls[0][0].prompt).toBe(prompt)
    expect(prompt).toContain(`ID: ${G2}`)
  })
})

describe('notice lifecycle', () => {
  it('clears the launch notice when the user types again', async () => {
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent('Started Codex in this workspace.')
    await type('Next')
    expect(note()).toHaveTextContent(/^$/)
  })

  it('replaces a failed-start error with the next attempt', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    launch.mockReturnValueOnce(null)
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launch.mockReturnValueOnce(localLaunch({ promptDeliveryResult: delivery.promise }))
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(note()).toHaveTextContent(/^Could not start Codex\.$/)
    await clickSend()
    expect(note()).toHaveTextContent(/^Starting Codex…$/)
    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    expect(note()).toHaveTextContent('Sent to Codex.')
    logged.mockRestore()
  })

  it('a later send to the launched session replaces the notice with the usual sent note', async () => {
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    await act(async () => seedSession(PAGE_WORKTREE_ID, 'tab-new', NEW_LEAF, 'Codex (new)'))
    await type('Follow up')
    await clickSend()
    expect(send).toHaveBeenCalledOnce()
    expect(note()).toHaveTextContent(/^Sent to Codex \(new\)$/)
  })
})

describe('follow-up selection', () => {
  it('selects the launched session when a new one was picked next to existing sessions', async () => {
    seedSession(PAGE_WORKTREE_ID, 'tab-a', OLD_LEAF, 'Codex session')
    useAppStore.setState({ activeTabIdByWorktree: { [PAGE_WORKTREE_ID]: 'tab-a' } })
    const user = userEvent.setup()
    renderWithTooltips(composer())
    await user.click(targetSelect())
    await user.click(screen.getByRole('option', { name: 'New Claude session' }))
    await type('Plan this goal')
    await clickSend()
    expect(targetSelect()).toHaveTextContent('New Claude session')
    await act(async () => seedSession(PAGE_WORKTREE_ID, 'tab-new', NEW_LEAF, 'Claude (new)'))
    expect(targetSelect()).toHaveTextContent('Claude (new)')
    expect(sessionOf(PAGE_WORKTREE_ID)?.newSessionAgent).toBeNull()
  })

  it('selects the launched session while its delivery is still pending, but Send waits', async () => {
    const delivery = deferred<{ delivered: boolean; failureNotified: boolean }>()
    launch.mockReturnValue(localLaunch({ promptDeliveryResult: delivery.promise }))
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    await act(async () => seedSession(PAGE_WORKTREE_ID, 'tab-new', NEW_LEAF, 'Codex (new)'))
    expect(targetSelect()).toHaveTextContent('Codex (new)')
    expect(sendButton()).toBeDisabled()
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(send).not.toHaveBeenCalled()
    await act(async () => delivery.resolve({ delivered: true, failureNotified: false }))
    expect(note()).toHaveTextContent('Sent to Codex. It runs in a new tab of this workspace.')
    expect(launch).toHaveBeenCalledOnce()
  })

  it('does not override a session the user picked after the launch', async () => {
    seedSession(PAGE_WORKTREE_ID, 'tab-a', OLD_LEAF, 'Codex session')
    useAppStore.setState({ activeTabIdByWorktree: { [PAGE_WORKTREE_ID]: 'tab-a' } })
    const user = userEvent.setup()
    renderWithTooltips(composer())
    await user.click(targetSelect())
    await user.click(screen.getByRole('option', { name: 'New Claude session' }))
    await type('Plan this goal')
    await clickSend()
    await user.click(targetSelect())
    await user.click(screen.getByRole('option', { name: 'Codex session' }))
    await act(async () => seedSession(PAGE_WORKTREE_ID, 'tab-new', NEW_LEAF, 'Claude (new)'))
    expect(targetSelect()).toHaveTextContent('Codex session')
    expect(sessionOf(PAGE_WORKTREE_ID)?.target?.tabId).toBe('tab-a')
  })

  it('reports a host-published launch without claiming a local tab', async () => {
    launch.mockReturnValue({
      surface: { kind: 'host-published' },
      startupPlan: {
        agent: 'codex',
        launchCommand: 'codex',
        expectedProcess: 'codex',
        followupPrompt: null,
        launchConfig: { agentArgs: '', agentEnv: {} }
      },
      pasteDraftAfterLaunch: true,
      promptDeliveryResult: Promise.resolve({ delivered: true, failureNotified: false })
    })
    renderWithTooltips(composer())
    await type('Plan this goal')
    await clickSend()
    expect(sessionOf(PAGE_WORKTREE_ID)?.launchedTabId).toBeNull()
    expect(note()).toHaveTextContent('Sent to Codex. It runs in a new tab of this workspace.')
    expect(textbox().value).toBe('')
  })
})
