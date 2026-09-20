// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { TriviumSessionPanel } from './TriviumSessionPanel'
import { useTriviumSession } from './use-trivium-session'
import { useTriviumSessionState } from './trivium-session-state'
import { makeTriviumStatus } from './trivium-workspace-status.fixture'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))
vi.mock('./TriviumSessionTerminal', () => ({
  TriviumSessionTerminal: ({ target }: { target: { ptyId: string } }) => (
    <div>Terminal {target.ptyId}</div>
  )
}))

const LEAF = '11111111-1111-4111-8111-111111111111'
const status = makeTriviumStatus()
let root: Root
let container: HTMLDivElement

function Panel({
  workspaceId = 'wt',
  goalId = 'goal.purpose'
}: {
  workspaceId?: string
  goalId?: string
}) {
  const controller = useTriviumSession(workspaceId, workspaceId)
  return (
    <TriviumSessionPanel
      controller={controller}
      goals={status.goals}
      goal={status.goals.nodes.find((node) => node.id === goalId) ?? null}
      workspaceId={workspaceId}
      workspacePath="/repo"
    />
  )
}

function seedWorkspace(workspaceId: string): void {
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

async function submit(draft: string, key = 'wt'): Promise<void> {
  await act(async () => useTriviumSessionState.getState().update(key, { draft }))
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  send.mockReset().mockResolvedValue({ status: 'sent' })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useTriviumSessionState.setState({ sessions: {} })
  seedWorkspace('wt')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Trivium session', () => {
  it('sends successive node requests to the same session after remounting', async () => {
    await act(async () => root.render(<Panel />))
    expect(container.textContent).toContain('Terminal pty-a')
    await submit('Change the purpose')
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        noteTarget: { tabId: 'tab-a', leafId: LEAF },
        prompt: expect.stringContaining('goal.purpose (G0, adopted)')
      })
    )
    await act(async () => root.render(null))
    useAppStore.setState({ activeTabIdByWorktree: { wt: 'tab-b' } })
    await act(async () => root.render(<Panel goalId="goal.outcome" />))
    await submit('Change the outcome')
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        noteTarget: { tabId: 'tab-a', leafId: LEAF },
        prompt: expect.stringContaining('goal.outcome (G1, adopted)')
      })
    )
    expect(container.querySelector('textarea')?.value).toBe('')
  })

  it('retains the request after failure and disables a replaced terminal', async () => {
    send.mockResolvedValue({ status: 'status-unavailable' })
    await act(async () => root.render(<Panel />))
    await submit('Keep this request')
    expect(container.querySelector('textarea')?.value).toBe('Keep this request')
    expect(container.textContent).toContain('Session unavailable')
    await act(async () => useAppStore.setState({ ptyIdsByTabId: { 'tab-a': ['replacement'] } }))
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true)
    await submit('Do not reroute')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends folder workspace requests through the same host-aware delivery path', async () => {
    seedWorkspace('folder:one')
    await act(async () => root.render(<Panel workspaceId="folder:one" />))
    await submit('Update this folder goal', 'folder:one')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ worktreeId: 'folder:one' }))
    await act(async () => root.render(<Panel workspaceId="folder:two" />))
    expect(container.textContent).not.toContain('Terminal pty-a')
    expect(container.querySelector('textarea')?.value).toBe('')
  })

  it('disables duplicate submits until the current request settles', async () => {
    let finish: (value: { status: string }) => void = () => {}
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    await act(async () => root.render(<Panel />))
    await submit('One request')
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true)
    await submit('One request')
    expect(send).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 'sent' }))
    expect(container.querySelector('textarea')?.value).toBe('')
  })
})
