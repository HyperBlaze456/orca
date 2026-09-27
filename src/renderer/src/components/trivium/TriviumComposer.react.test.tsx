// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TriviumModel } from './trivium-goal-model'
import { G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import { renderWithTooltips, requireElement, requireTextArea } from './trivium-reader-test-harness'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumComposer } from './TriviumComposer'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

const LEAF = '11111111-1111-4111-8111-111111111111'
const { model } = makeReaderFixture()

function seedAgent(workspaceId: string): void {
  const paneKey = makePaneKey('tab-a', LEAF)
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
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: 'pty-a' }
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

function composer(itemId: string, sessionKey = 'wt', target: TriviumModel = model) {
  return (
    <TriviumComposer
      model={target}
      itemId={itemId}
      workspaceId="wt"
      sessionKey={sessionKey}
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

async function type(text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(textbox(), { target: { value: text } })
  })
}

beforeEach(() => {
  send.mockReset().mockResolvedValue({ status: 'sent' })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useTriviumSessionState.setState({ sessions: {} })
  seedAgent('wt')
})
afterEach(cleanup)

describe('Trivium composer', () => {
  it('names the item, offers its quick starts and sends on Enter with the item context', async () => {
    renderWithTooltips(composer(G2))
    const context = requireElement(document.querySelector('[data-trivium-composer-context]'))
    expect(context).toHaveTextContent(/^G2 goal첫 동기화 단계/)
    expect(textbox()).toHaveAttribute('placeholder', 'Ask the agent about this goal…')
    fireEvent.click(screen.getByRole('button', { name: 'Split into sub-goals' }))
    expect(textbox().value).toBe('Split into sub-goals')

    await type('Why is this goal split this way?')
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(send).toHaveBeenCalledOnce()
    const prompt: string = send.mock.calls[0][0].prompt
    expect(prompt).toContain(`ID: ${G2}`)
    expect(prompt).toContain('Tier: G2 (Campaign outcome)')
    expect(prompt).toMatch(/Request:\nWhy is this goal split this way\?$/)
    expect(send.mock.calls[0][0]).toMatchObject({
      worktreeId: 'wt',
      noteTarget: { tabId: 'tab-a', leafId: LEAF }
    })
    expect(textbox().value).toBe('')
    expect(note()).toHaveTextContent('Sent to Codex session')
  })

  it('adds a line on Shift+Enter and never sends mid-composition', async () => {
    renderWithTooltips(composer('ticket.export-cutoff'))
    expect(document.querySelector('[data-trivium-composer-context]')).toHaveTextContent(/^Ticket/)
    await type('검토')
    fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, shiftKey: true })
    fireEvent.compositionStart(textbox())
    fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, isComposing: true })
    fireEvent.keyDown(textbox(), { key: 'Process', keyCode: 229, isComposing: true })
    fireEvent.compositionEnd(textbox(), { data: '검토' })
    // The Enter the IME redispatches after confirming a candidate is swallowed too.
    fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, isComposing: false })
    expect(send).not.toHaveBeenCalled()

    fireEvent.keyUp(textbox(), { key: 'Enter', keyCode: 13 })
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, isComposing: false })
    })
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0].prompt).toContain('ID: ticket.export-cutoff')
  })

  it('keeps the context captured at send even when the page moves on meanwhile', async () => {
    let finish: (value: { status: string }) => void = () => {}
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const view = renderWithTooltips(composer(G2))
    await type('Summarize this')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(textbox()).toBeDisabled()
    view.rerender(composer(G1_SEARCH))
    useAppStore.setState({
      tabsByWorktree: {
        wt: [{ ...useAppStore.getState().tabsByWorktree.wt[0], title: 'Renamed session' }]
      }
    })
    await act(async () => finish({ status: 'sent' }))
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0].prompt).toContain(`ID: ${G2}`)
    expect(send.mock.calls[0][0].prompt).not.toContain(G1_SEARCH)
    expect(note()).toHaveTextContent('Sent to Codex session')
  })

  it('keeps the draft and shows the session error when sending fails', async () => {
    send.mockResolvedValue({ status: 'status-unavailable' })
    renderWithTooltips(composer(G2))
    await type('Keep this request')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(textbox().value).toBe('Keep this request')
    expect(note()).toHaveTextContent('Session unavailable')
    expect(note()).not.toHaveTextContent('Sent to')
  })

  // WO-6: with no session the composer offers new sessions (TriviumComposerNewSession), so the old
  // "start an agent session" note is gone; until an agent is detected there is nothing to send to.
  it('cannot send without an agent session while no agent to start is known yet', async () => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    renderWithTooltips(composer(G2))
    await type('Anything')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Agent session' })).toBeDisabled()
    expect(note()).toHaveTextContent(/^$/)
    fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps a separate draft per session key', async () => {
    const view = renderWithTooltips(composer(G2, 'first'))
    await type('Draft for the first workspace')
    view.rerender(composer(G2, 'second'))
    expect(textbox().value).toBe('')
    view.rerender(composer(G2, 'first'))
    expect(textbox().value).toBe('Draft for the first workspace')
  })
})
