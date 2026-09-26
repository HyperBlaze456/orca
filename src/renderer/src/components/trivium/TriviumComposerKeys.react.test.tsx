// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { G2 } from './trivium-model-tables.fixture'
import { renderWithTooltips, requireElement, requireTextArea } from './trivium-reader-test-harness'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumComposer } from './TriviumComposer'

// Verifier (WO-3 r1): keyboard edges, an agent that cannot take a request, and failures.

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

const LEAF = '33333333-3333-4333-8333-333333333333'
const { model } = makeReaderFixture()

function seedAgent(state: 'done' | 'waiting'): void {
  const paneKey = makePaneKey('tab-k', LEAF)
  useAppStore.setState({
    activeTabIdByWorktree: { wt: 'tab-k' },
    tabsByWorktree: {
      wt: [
        {
          id: 'tab-k',
          worktreeId: 'wt',
          ptyId: null,
          title: 'Claude session',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    ptyIdsByTabId: { 'tab-k': ['pty-k'] },
    terminalLayoutsByTabId: {
      'tab-k': {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: 'pty-k' }
      }
    },
    agentStatusByPaneKey: {
      [paneKey]: {
        paneKey,
        state,
        prompt: '',
        updatedAt: Date.now(),
        stateStartedAt: Date.now(),
        agentType: 'claude',
        stateHistory: []
      }
    }
  })
}

function renderComposer(itemId = G2) {
  return renderWithTooltips(
    <TriviumComposer
      model={model}
      itemId={itemId}
      workspaceId="wt"
      sessionKey="wt"
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
})
afterEach(cleanup)

describe('composer keys', () => {
  beforeEach(() => seedAgent('done'))

  it('lets Shift+Enter insert a newline and takes plain Enter for sending', async () => {
    renderComposer()
    await type('First line')
    expect(fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, shiftKey: true })).toBe(true)
    expect(send).not.toHaveBeenCalled()
    let allowed = true
    await act(async () => {
      allowed = fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(allowed).toBe(false)
    expect(send).toHaveBeenCalledOnce()
  })

  it('never sends a blank request', async () => {
    renderComposer()
    await type('  \n  ')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('ignores an Enter the IME marks, with or without composition events', async () => {
    renderComposer()
    await type('검토해 줘')
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 229 })
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13, isComposing: true })
    })
    expect(send).not.toHaveBeenCalled()
    // Once the gesture is over, the user's own Enter sends.
    fireEvent.keyUp(textbox(), { key: 'Enter', keyCode: 13 })
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('sends once when Enter is pressed again while the first send is in flight', async () => {
    let finish: (value: { status: string }) => void = () => {}
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderComposer()
    await type('Only once')
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await act(async () => finish({ status: 'sent' }))
    expect(send).toHaveBeenCalledOnce()
    expect(note()).toHaveTextContent(/^Sent to Claude session$/)
  })

  it('fills the draft from a quick start without sending', async () => {
    renderComposer('ticket.sync-export')
    fireEvent.click(screen.getByRole('button', { name: 'What does it depend on?' }))
    expect(textbox().value).toBe('What does it depend on?')
    expect(send).not.toHaveBeenCalled()
  })

  it('drops the sent note once the user starts a new request', async () => {
    renderComposer()
    await type('Send me')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(note()).toHaveTextContent('Sent to Claude session')
    await type('Next request')
    expect(note()).not.toHaveTextContent('Sent to')
  })

  it('keeps the draft and shows the hook error when the send throws', async () => {
    send.mockRejectedValue(new Error('pty gone'))
    renderComposer()
    await type('Keep me')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(textbox().value).toBe('Keep me')
    expect(note()).toHaveTextContent('Session unavailable')
    expect(note()).not.toHaveTextContent('Sent to')
  })
})

describe('composer with an agent that cannot take a request', () => {
  it('disables Send and says why', async () => {
    seedAgent('waiting')
    renderComposer()
    await type('Anything')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(note()).toHaveTextContent('Agent needs permission')
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    expect(send).not.toHaveBeenCalled()
  })
})
