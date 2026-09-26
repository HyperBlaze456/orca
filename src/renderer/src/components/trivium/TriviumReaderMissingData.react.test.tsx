// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { describeTriviumItemForAgent } from './trivium-composer-prompt'
import {
  G0,
  G1_SEARCH,
  G1_SYNC,
  G2,
  type TriviumFixtureBinary
} from './trivium-model-tables.fixture'
import type { TriviumLoadState, TriviumReaderLoadState } from './trivium-reader-load'
import { triviumWorkText } from './trivium-reader-text'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement,
  requireTextArea
} from './trivium-reader-test-harness'
import {
  makeReaderFixture,
  withTicketStates,
  type ReaderFixture
} from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumProgressRing } from './TriviumIcons'
import { TriviumReader } from './TriviumReader'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import type { TriviumRoute } from './use-trivium-navigation'

// Verifier (WO-3 r2): missing ticket records never read as zero, loaded data reads as in r1,
// HEAD keeps its recorded counts, and every page reports a failed ticket load once.

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

const RING = '[data-trivium-icon="progress-ring"]'
const LEAF = '44444444-4444-4444-8444-444444444444'
const MISSING = 'unknown, ticket records are not loaded'

const item = (id: string): TriviumRoute => ({ view: 'item', id, anchor: null })
const ROUTES: TriviumRoute[] = [
  { view: 'overview' },
  { view: 'tickets', parentId: null },
  { view: 'tickets', parentId: G2 },
  { view: 'tickets', parentId: G1_SYNC },
  item(G0),
  item(G1_SYNC),
  item(G1_SEARCH),
  item(G2),
  item('ticket.export-cutoff'),
  item('ticket.sync-export'),
  item('goal.export-write-check')
]

function withoutRecords(binary: TriviumFixtureBinary): ReaderFixture {
  return makeReaderFixture(binary, undefined, (input) => ({ ...input, tickets: [] }))
}

function renderRoute(
  route: TriviumRoute,
  fixture: ReaderFixture,
  loadState: TriviumReaderLoadState
) {
  return renderWithTooltips(
    <TriviumReader
      model={fixture.model}
      entries={fixture.entries}
      navigation={makeReaderNavigation(route)}
      changes={new Map()}
      loadState={loadState}
      workspaceId="wt"
      sessionKey="wt"
    />
  )
}

function ringValue(scope: Element | null): string | null {
  return scope?.querySelector(RING)?.getAttribute('data-value') ?? null
}

function clamped(fraction: number): string {
  return String(Number.isNaN(fraction) ? 0 : Math.min(1, Math.max(0, fraction)))
}

function seedAgent(): void {
  const paneKey = makePaneKey('tab-m', LEAF)
  useAppStore.setState({
    activeTabIdByWorktree: { wt: 'tab-m' },
    tabsByWorktree: {
      wt: [
        {
          id: 'tab-m',
          worktreeId: 'wt',
          ptyId: null,
          title: 'Codex session',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    ptyIdsByTabId: { 'tab-m': ['pty-m'] },
    terminalLayoutsByTabId: {
      'tab-m': {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: 'pty-m' }
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

async function sendFromComposer(): Promise<string> {
  const input = requireTextArea(screen.getByRole('textbox', { name: 'Message to the agent' }))
  await act(async () => {
    fireEvent.change(input, { target: { value: 'What is left?' } })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  })
  expect(send).toHaveBeenCalledOnce()
  return send.mock.calls[0][0].prompt
}

beforeEach(() => {
  send.mockReset().mockResolvedValue({ status: 'sent' })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useTriviumSessionState.setState({ sessions: {} })
})
afterEach(cleanup)

describe.each(['head', 'installed'] as const)(
  'everything loaded on %s reads as in r1',
  (binary) => {
    const fixture = makeReaderFixture(binary)
    const { model } = fixture

    it.each(ROUTES.map((route) => [JSON.stringify(route), route] as const))(
      '%s: rings follow the model, never pulse, and nothing reads unknown',
      (_label, route) => {
        const { container } = renderRoute(route, fixture, makeLoadState())
        for (const ring of container.querySelectorAll(RING)) {
          expect(ring).not.toHaveClass('animate-pulse')
        }
        expect(container.querySelector('[data-trivium-work-unknown]')).toBeNull()
        expect(container.querySelector('[data-trivium-pending]')).toBeNull()
        for (const row of container.querySelectorAll('[data-trivium-goal-row]')) {
          const id = row.getAttribute('data-trivium-goal-row') ?? ''
          expect(ringValue(row)).toBe(clamped(model.work(id).fraction))
          expect(row.querySelector('[data-trivium-work]')).toHaveTextContent(
            triviumWorkText(model.work(id))
          )
        }
        for (const row of container.querySelectorAll('[data-trivium-ticket-row]')) {
          const id = row.getAttribute('data-trivium-ticket-row') ?? ''
          expect(row.querySelector('[data-trivium-icon="ticket-status"]')).toHaveAttribute(
            'data-value',
            model.ticketKind(id)
          )
        }
        if (route.view === 'item' && !model.isTicket(route.id)) {
          const fraction = clamped(model.work(route.id).fraction)
          expect(ringValue(container.querySelector('[data-trivium-goal-tile]'))).toBe(fraction)
          expect(container.querySelector('[data-trivium-pill="work"]')).toHaveTextContent(
            `Work ${triviumWorkText(model.work(route.id))}`
          )
          expect(ringValue(container.querySelector('[data-trivium-composer-context]'))).toBe(
            fraction
          )
        }
        if (route.view === 'item' && model.isTicket(route.id)) {
          const parent = model.parent(route.id) ?? ''
          expect(ringValue(container.querySelector('[data-trivium-property="goal"]'))).toBe(
            clamped(model.work(parent).fraction)
          )
          expect(
            container.querySelector('[data-trivium-composer-context] [data-trivium-icon]')
          ).toHaveAttribute('data-value', model.ticketKind(route.id))
        }
        if (route.view === 'tickets' && route.parentId) {
          expect(ringValue(container.querySelector('[data-trivium-pill="parent-filter"]'))).toBe(
            clamped(model.work(route.parentId).fraction)
          )
        }
      }
    )

    it('builds the same prompt by default as with every detail loaded, with nothing unknown', () => {
      for (const node of model.nodes) {
        const loaded = describeTriviumItemForAgent(model, node.id, {
          tickets: 'ready',
          progress: 'ready'
        })
        expect(describeTriviumItemForAgent(model, node.id)).toBe(loaded)
        expect(loaded).not.toContain('unknown, ')
      }
    })
  }
)

describe('the work ring', () => {
  it('draws exactly the plain progress ring once counts are known', () => {
    for (const fraction of [0, 0.25, 0.5, 1, Number.NaN]) {
      for (const size of [undefined, 12, 16, 24]) {
        for (const dashed of [false, true]) {
          const plain = render(
            <TriviumProgressRing fraction={fraction} size={size} dashed={dashed} />
          )
          const expected = plain.container.innerHTML
          plain.unmount()
          const work = render(
            <TriviumReaderWorkRing state="ready" fraction={fraction} size={size} dashed={dashed} />
          )
          expect(work.container.innerHTML).toBe(expected)
          work.unmount()
        }
      }
    }
  })

  it.each([
    ['loading', 'pulses an empty track'],
    ['error', 'is left out']
  ] as const)('while %s it %s instead of reading as zero', (state, _behavior) => {
    const loadState: TriviumLoadState = state
    const { container } = render(<TriviumReaderWorkRing state={loadState} fraction={0.75} />)
    const ring = container.querySelector(RING)
    if (state === 'error') {
      expect(ring).toBeNull()
    } else {
      expect(ring).toHaveAttribute('data-value', '0')
      expect(ring).toHaveClass('animate-pulse')
    }
  })
})

describe('relation rows', () => {
  // sync-evaluation waits on sync-refresh; both stay unfinished.
  const fixture = makeReaderFixture(
    'installed',
    withTicketStates({ 'ticket.sync-refresh': 'in-progress', 'ticket.sync-evaluation': 'open' })
  )

  it('keep their status icons and waiting pills once ticket records are loaded', () => {
    renderRoute(item('ticket.sync-export'), fixture, makeLoadState())
    const requiredBy = screen.getByRole('region', { name: 'Required by' })
    const row = requireElement(
      requiredBy.querySelector('[data-trivium-ticket-row="ticket.sync-evaluation"]')
    )
    expect(row.querySelector('[data-trivium-icon="ticket-status"]')).toHaveAttribute(
      'data-value',
      'open'
    )
    expect(row.querySelector('[data-trivium-waiting]')).toHaveTextContent('Waiting on 1')
  })

  it('show neither while ticket records load', () => {
    renderRoute(item('ticket.sync-export'), fixture, makeLoadState('loading', 'ready'))
    const requiredBy = screen.getByRole('region', { name: 'Required by' })
    expect(requiredBy.querySelectorAll('[data-trivium-ticket-row]')).toHaveLength(2)
    expect(requiredBy.querySelector('[data-trivium-icon="ticket-status"]')).toBeNull()
    expect(requiredBy.querySelector('[data-trivium-waiting]')).toBeNull()
  })
})

describe('HEAD keeps the counts progress recorded when ticket records fail', () => {
  const fixture = withoutRecords('head')
  const { model } = fixture
  const failed = (): TriviumReaderLoadState => makeLoadState('error', 'ready')

  it.each([G0, G1_SYNC])('Goal page of %s: sub-goals, tile and Work pill keep them', (id) => {
    expect(model.work(id).source).toBe('recorded-work')
    const { container } = renderRoute(item(id), fixture, failed())
    for (const sub of model.subGoals(id)) {
      const row = requireElement(container.querySelector(`[data-trivium-goal-row="${sub}"]`))
      expect(row.querySelector('[data-trivium-work]')).toHaveTextContent(
        triviumWorkText(model.work(sub))
      )
      expect(ringValue(row)).toBe(clamped(model.work(sub).fraction))
    }
    expect(ringValue(container.querySelector('[data-trivium-goal-tile]'))).toBe(
      clamped(model.work(id).fraction)
    )
    expect(container.querySelector('[data-trivium-pill="work"]')).toHaveTextContent(
      `Work ${triviumWorkText(model.work(id))}`
    )
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(tickets).not.toHaveTextContent(/\d+\/\d+ done/)
    expect(container.querySelectorAll('[data-trivium-pending="error"]')).toHaveLength(1)
  })

  it('Ticket page and list chip keep the parent ring', () => {
    const ticket = renderRoute(item('ticket.sync-export'), fixture, failed())
    expect(ringValue(ticket.container.querySelector('[data-trivium-property="goal"]'))).toBe(
      clamped(model.work(G2).fraction)
    )
    expect(
      ticket.container.querySelector('[data-trivium-composer-context] [data-trivium-icon]')
    ).toBeNull()
    cleanup()
    const list = renderRoute({ view: 'tickets', parentId: G2 }, fixture, failed())
    expect(ringValue(list.container.querySelector('[data-trivium-pill="parent-filter"]'))).toBe(
      clamped(model.work(G2).fraction)
    )
  })

  it('sends the recorded work count and an unknown workflow state', async () => {
    seedAgent()
    renderRoute(item(G2), fixture, failed())
    expect(await sendFromComposer()).toContain(
      'Work: 10/10 tickets done (work only; the outcome is unassessed)'
    )
    cleanup()
    send.mockClear()
    useTriviumSessionState.setState({ sessions: {} })
    renderRoute(item('ticket.sync-export'), fixture, failed())
    const prompt = await sendFromComposer()
    expect(prompt).toContain(`Workflow state: ${MISSING}`)
    expect(prompt).not.toContain('Workflow state: open')
  })
})

describe('installed binary without ticket records, through the reader', () => {
  it('sends "unknown" instead of zero work or an open state', async () => {
    seedAgent()
    const fixture = withoutRecords('installed')
    renderRoute(item(G2), fixture, makeLoadState('error', 'ready'))
    const prompt = await sendFromComposer()
    expect(prompt).toContain(`Work: ${MISSING} (work only; the outcome is unassessed)`)
    expect(prompt).not.toMatch(/Work: 0\/\d+ tickets done/)
  })
})

describe('one tickets notice per page', () => {
  const fixtures = [
    ['head with records', makeReaderFixture('head')],
    ['installed with records', makeReaderFixture('installed')],
    ['head without records', withoutRecords('head')],
    ['installed without records', withoutRecords('installed')]
  ] as const

  it.each(fixtures)('on %s, when ticket records failed or are loading', (_label, fixture) => {
    for (const route of ROUTES) {
      const failed = renderRoute(route, fixture, makeLoadState('error', 'ready'))
      const notices = [...failed.container.querySelectorAll('[data-trivium-pending="error"]')]
      expect(
        notices.map((notice) => notice.textContent),
        JSON.stringify(route)
      ).toEqual(["Couldn't load tickets.Retry"])
      cleanup()
      renderRoute(route, fixture, makeLoadState('loading', 'ready'))
      expect(
        screen.queryAllByRole('status', { name: 'Loading tickets…' }).length,
        JSON.stringify(route)
      ).toBeLessThanOrEqual(1)
      expect(screen.queryByText("Couldn't load tickets.")).toBeNull()
      cleanup()
    }
  })
})

describe('a progress refresh', () => {
  it('does not tell the agent that loaded ticket records are missing', () => {
    const { model } = makeReaderFixture('head')
    expect(model.work(G2).source).toBe('recorded-work')
    const context = describeTriviumItemForAgent(model, G2, {
      tickets: 'ready',
      progress: 'loading'
    })
    expect(context).not.toContain('ticket records are not loaded')
  })
})
