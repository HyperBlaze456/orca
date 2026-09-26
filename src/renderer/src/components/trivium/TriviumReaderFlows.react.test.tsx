// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TriviumModel } from './trivium-goal-model'
import type { TriviumTreeEntry } from './trivium-goal-tree'
import { fixtureApproveCommand, G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement,
  requireTextArea,
  type ReaderNavigationStub
} from './trivium-reader-test-harness'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumReader, type TriviumLoadState, type TriviumReaderProps } from './TriviumReader'
import { useTriviumNavigation } from './use-trivium-navigation'

// Verifier (WO-3 r1): reader flows with a live agent session, routes the order names, and the
// loading/error placeholders on every page.

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

const LEAF = '22222222-2222-4222-8222-222222222222'
const CANDIDATE = 'ticket.export-cutoff'

function seedAgent(workspaceId: string): void {
  const paneKey = makePaneKey('tab-v', LEAF)
  useAppStore.setState({
    activeTabIdByWorktree: { [workspaceId]: 'tab-v' },
    tabsByWorktree: {
      [workspaceId]: [
        {
          id: 'tab-v',
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
    ptyIdsByTabId: { 'tab-v': ['pty-v'] },
    terminalLayoutsByTabId: {
      'tab-v': {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: 'pty-v' }
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

function Page({
  model,
  entries,
  loadState = makeLoadState()
}: {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  loadState?: TriviumReaderLoadState
}): React.JSX.Element {
  const navigation = useTriviumNavigation({ storageKey: null, model, entries })
  return (
    <TriviumReader
      model={model}
      entries={entries}
      navigation={navigation}
      changes={new Map()}
      loadState={loadState}
      workspaceId="wt"
      sessionKey="wt"
    />
  )
}

function StubPage({
  navigation,
  loadState = makeLoadState(),
  fixture = makeReaderFixture()
}: {
  navigation: ReaderNavigationStub
  loadState?: TriviumReaderLoadState
  fixture?: { model: TriviumModel; entries: readonly TriviumTreeEntry[] }
}): React.JSX.Element {
  return (
    <TriviumReader
      model={fixture.model}
      entries={fixture.entries}
      navigation={navigation}
      changes={new Map()}
      loadState={loadState}
      workspaceId="wt"
      sessionKey="wt"
    />
  )
}

function page(): string | null {
  return document.querySelector('[data-trivium-page]')?.getAttribute('data-trivium-page') ?? null
}

function textbox(): HTMLTextAreaElement {
  return requireTextArea(screen.getByRole('textbox', { name: 'Message to the agent' }))
}

function note(): HTMLElement {
  return requireElement(document.querySelector('[data-trivium-composer-note]'))
}

function openCandidateFromOverview(): void {
  const candidate = requireElement(document.querySelector('[data-trivium-needs-you="candidate"]'))
  fireEvent.click(within(candidate).getByRole('button', { name: 'Review' }))
}

beforeEach(() => {
  send.mockReset().mockResolvedValue({ status: 'sent' })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useTriviumSessionState.setState({ sessions: {} })
  seedAgent('wt')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('approval stays with the user (AXIS A8)', () => {
  it('only prefills the request; nothing is sent until the user presses Send', async () => {
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} />)
    openCandidateFromOverview()
    expect(page()).toBe('ticket')
    const approval = requireElement(document.querySelector('[data-trivium-property="approval"] dd'))
    expect(approval).toHaveTextContent('Needs approval')

    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent to approve' }))
    expect(textbox().value).toContain('I approve the proposed ticket')
    expect(textbox().value).toContain(fixtureApproveCommand(CANDIDATE))
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    expect(send).not.toHaveBeenCalled()
    expect(document.body).not.toHaveTextContent(/\bApproved\b/)
    expect(approval).not.toHaveTextContent('Adopted')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(send).toHaveBeenCalledOnce()
    const prompt: string = send.mock.calls[0][0].prompt
    expect(prompt).toContain(`ID: ${CANDIDATE}`)
    expect(prompt).toContain('not part of the Goal model yet')
    expect(prompt).toMatch(/Request:\nI approve the proposed ticket/)
    expect(note()).toHaveTextContent(/^Sent to Codex session$/)
    // Sending the request is not an approval: the page still shows the ticket as waiting.
    expect(document.querySelector('[data-trivium-approval]')).not.toBeNull()
    expect(approval).toHaveTextContent('Needs approval')
    expect(document.body).not.toHaveTextContent(/\bApproved\b/)
  })

  it('does not overwrite a request that is already being sent', async () => {
    let finish: (value: { status: string }) => void = () => {}
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} />)
    openCandidateFromOverview()
    await act(async () => {
      fireEvent.change(textbox(), { target: { value: 'Explain this proposal first' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent to approve' }))
    expect(textbox().value).toBe('Explain this proposal first')
    await act(async () => finish({ status: 'sent' }))
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0].prompt).toMatch(/Request:\nExplain this proposal first$/)
    expect(textbox().value).toBe('')
  })
})

describe('composer inside the reader', () => {
  it('sends the Goal it was pressed on even after the user opens a ticket meanwhile', async () => {
    let finish: (value: { status: string }) => void = () => {}
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} />)
    fireEvent.click(requireElement(document.querySelector(`[data-trivium-goal-row="${G2}"]`)))
    await act(async () => {
      fireEvent.change(textbox(), { target: { value: 'Summarize this goal' } })
    })
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 13 })
    })
    fireEvent.click(
      requireElement(document.querySelector('[data-trivium-ticket-row="ticket.sync-export"]'))
    )
    expect(page()).toBe('ticket')
    expect(document.querySelector('[data-trivium-composer-context]')).toHaveTextContent(/^Ticket/)
    await act(async () => finish({ status: 'sent' }))
    expect(send).toHaveBeenCalledOnce()
    const prompt: string = send.mock.calls[0][0].prompt
    expect(prompt).toContain('Trivium goal (selected on the Trivium page):')
    expect(prompt).toContain(`ID: ${G2}`)
    expect(prompt).not.toContain('ID: ticket.sync-export')
    expect(note()).toHaveTextContent('Sent to Codex session')
  })

  it('is pinned below the reader scroll container, outside it', () => {
    const navigation = makeReaderNavigation({ view: 'item', id: G2, anchor: null })
    const { container } = renderWithTooltips(<StubPage navigation={navigation} />)
    const reader = requireElement(container.querySelector('[data-trivium-reader]'))
    expect(reader).toHaveClass('@container/reader')
    const children = [...reader.children]
    expect(children.map((child) => child.hasAttribute('data-trivium-reader-scroll'))).toEqual([
      true,
      false
    ])
    expect(children[1]).toHaveAttribute('data-trivium-composer')
    expect(children[0]).toHaveClass('overflow-y-auto')
    expect(textbox()).toHaveClass('[field-sizing:content]')
  })
})

describe('reader routes', () => {
  it('takes exactly the props and load state WO-4 supplies', () => {
    const { model, entries } = makeReaderFixture()
    const states: TriviumLoadState[] = ['loading', 'ready', 'error']
    const props: TriviumReaderProps = {
      model,
      entries,
      navigation: makeReaderNavigation(),
      changes: new Map(),
      loadState: { tickets: states[0], progress: states[1], retry: () => {} },
      workspaceId: 'wt',
      sessionKey: 'wt'
    }
    renderWithTooltips(<TriviumReader {...props} />)
    expect(page()).toBe('overview')
  })

  it('opens a G3 ticket with a goal. id as a ticket, not a Goal page', () => {
    const fixture = makeReaderFixture()
    const id = 'goal.export-write-check'
    const navigation = makeReaderNavigation({ view: 'item', id, anchor: null })
    renderWithTooltips(<StubPage navigation={navigation} fixture={fixture} />)
    expect(page()).toBe('ticket')
    expect(document.querySelector('[data-trivium-composer-context]')).toHaveTextContent(/^Ticket/)
    const siblings = fixture.model.directTickets(G1_SEARCH)
    expect(document.querySelector('[data-trivium-pager]')).toHaveTextContent(
      `${siblings.indexOf(id) + 1} / ${siblings.length}`
    )
    expect(document.querySelector('[data-trivium-property="status"] dd')).toHaveTextContent('Open')
    expect(document.querySelector('[data-trivium-property="merged"] dd')).toHaveTextContent('—')
  })

  it.each([
    ['an id that never existed', { view: 'item', id: 'goal.never-was', anchor: null }],
    ['a ticket list under an unknown goal', { view: 'tickets', parentId: 'goal.never-was' }]
  ] as const)('shows the missing state for %s with a way back', (_label, route) => {
    const navigation = makeReaderNavigation(route)
    renderWithTooltips(<StubPage navigation={navigation} />)
    expect(page()).toBe('missing')
    expect(screen.getByText('This item is no longer in the Goal model')).toBeInTheDocument()
    expect(document.querySelector('[data-trivium-composer]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))
    expect(navigation.openOverview).toHaveBeenCalledOnce()
  })

  it('has no back button on any page', () => {
    for (const route of [
      { view: 'overview' },
      { view: 'tickets', parentId: null },
      { view: 'item', id: G2, anchor: null },
      { view: 'item', id: CANDIDATE, anchor: null }
    ] as const) {
      renderWithTooltips(<StubPage navigation={makeReaderNavigation(route)} />)
      expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
      cleanup()
    }
  })

  it('lands an updates link on the milestones once progress arrives', () => {
    const scrolled = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
    const navigation = makeReaderNavigation({ view: 'item', id: G2, anchor: 'updates' })
    const view = renderWithTooltips(
      <StubPage navigation={navigation} loadState={makeLoadState('ready', 'loading')} />
    )
    expect(scrolled).not.toHaveBeenCalled()
    view.rerender(<StubPage navigation={navigation} loadState={makeLoadState('ready', 'ready')} />)
    expect(scrolled).toHaveBeenCalledOnce()
    expect(requireElement(scrolled.mock.contexts[0])).toHaveAttribute(
      'data-trivium-section',
      'latest-milestone'
    )
    view.rerender(<StubPage navigation={navigation} loadState={makeLoadState('ready', 'ready')} />)
    expect(scrolled).toHaveBeenCalledOnce()
  })
})

describe('failed loads offer Retry wherever the data is missing', () => {
  function expectRetry(need: 'tickets' | 'progress details', loadState = makeLoadState()): void {
    const failure = screen
      .getAllByText(`Couldn't load ${need}.`)
      .map((element) => element.closest('[data-trivium-pending="error"]'))
      .find((element) => element !== null)
    const retry = within(requireElement(failure)).getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    expect(loadState.retry).toHaveBeenCalledOnce()
  }

  it('on the Overview when tickets failed (Goals need them for work)', () => {
    const loadState = makeLoadState('error', 'ready')
    renderWithTooltips(
      <StubPage navigation={makeReaderNavigation({ view: 'overview' })} loadState={loadState} />
    )
    expectRetry('tickets', loadState)
  })

  it.each([G0, G1_SYNC])(
    'on the Goal page of %s when tickets failed (every ticket sits under sub-goals)',
    (id) => {
      const loadState = makeLoadState('error', 'ready')
      renderWithTooltips(
        <StubPage
          navigation={makeReaderNavigation({ view: 'item', id, anchor: null })}
          loadState={loadState}
        />
      )
      expectRetry('tickets', loadState)
    }
  )

  it('on the Goal page of G2 when tickets failed', () => {
    const loadState = makeLoadState('error', 'ready')
    renderWithTooltips(
      <StubPage
        navigation={makeReaderNavigation({ view: 'item', id: G2, anchor: null })}
        loadState={loadState}
      />
    )
    expectRetry('tickets', loadState)
  })

  it('on the Ticket page when progress failed', () => {
    const loadState = makeLoadState('ready', 'error')
    renderWithTooltips(
      <StubPage
        navigation={makeReaderNavigation({ view: 'item', id: CANDIDATE, anchor: null })}
        loadState={loadState}
      />
    )
    expect(screen.queryByRole('region', { name: 'Delivered by' })).toBeNull()
    expectRetry('progress details', loadState)
  })

  it('on the Overview when progress failed, keeping status-only rows', () => {
    const loadState = makeLoadState('ready', 'error')
    const { container } = renderWithTooltips(
      <StubPage navigation={makeReaderNavigation({ view: 'overview' })} loadState={loadState} />
    )
    expect(container.querySelectorAll('[data-trivium-needs-you="candidate"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-trivium-goal-row]')).toHaveLength(4)
    expectRetry('progress details', loadState)
  })
})
