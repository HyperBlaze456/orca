// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { buildTriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries } from './trivium-goal-tree'
import { G0, G1_SYNC, G2, type TriviumFixtureBinary } from './trivium-model-tables.fixture'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import { triviumWorkText } from './trivium-reader-text'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumReader } from './TriviumReader'
import type { TriviumRoute } from './use-trivium-navigation'

// AXIS A8: a count or state that depends on ticket records never reads as "no work done"
// while those records are loading or after they failed.

vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: vi.fn(),
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

const RING = '[data-trivium-icon="progress-ring"]'

/** The fixture as the page builds it when the ticket projection never arrived. */
function withoutTicketRecords(binary: TriviumFixtureBinary): ReaderFixture {
  return makeReaderFixture(binary, undefined, (input) => ({ ...input, tickets: [] }))
}

function renderRoute(
  route: TriviumRoute,
  fixture: ReaderFixture,
  loadState: TriviumReaderLoadState
): ReturnType<typeof renderWithTooltips> {
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

function goalItem(id: string): TriviumRoute {
  return { view: 'item', id, anchor: null }
}

function workPill(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-trivium-pill="work"]')
}

function tile(container: HTMLElement): HTMLElement {
  return requireElement(container.querySelector('[data-trivium-goal-tile]'))
}

function failures(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-trivium-pending="error"]')]
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useTriviumSessionState.setState({ sessions: {} })
})
afterEach(cleanup)

describe('failed ticket records, installed binary (work is counted from them)', () => {
  const fixture = withoutTicketRecords('installed')

  it('would count zero done, so the precondition holds', () => {
    expect(fixture.model.work(G2)).toMatchObject({ done: 0, source: 'derived' })
    expect(fixture.model.work(G2).total).toBeGreaterThan(0)
  })

  it('Overview: Goal rows show "—" with no ring, and the Goals section offers Retry', () => {
    const loadState = makeLoadState('error', 'ready')
    renderRoute({ view: 'overview' }, fixture, loadState)
    const goals = screen.getByRole('region', { name: 'Goals' })
    const rows = [...goals.querySelectorAll('[data-trivium-goal-row]')]
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.querySelector(RING)).toBeNull()
      expect(row.querySelector('[data-trivium-work]')).toBeNull()
      expect(row.querySelector('[data-trivium-work-unknown]')).toHaveTextContent('—')
    }
    expect(goals).not.toHaveTextContent(/\d+\/\d+ tickets done/)
    const failure = requireElement(goals.querySelector('[data-trivium-pending="error"]'))
    expect(failure).toHaveTextContent("Couldn't load tickets.")
    fireEvent.click(within(failure).getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
  })

  it('Goal page: no ring in the tile or the composer, Work reads "—", one notice in Tickets', () => {
    const { container } = renderRoute(goalItem(G2), fixture, makeLoadState('error', 'ready'))
    expect(tile(container).querySelector(RING)).toBeNull()
    expect(workPill(container)).toHaveTextContent(/^Work —$/)
    expect(workPill(container)?.querySelector(RING)).toBeNull()
    expect(document.querySelector(`[data-trivium-composer-context] ${RING}`)).toBeNull()
    const [failure, ...rest] = failures(container)
    expect(rest).toEqual([])
    expect(screen.getByRole('region', { name: 'Tickets' })).toContainElement(
      requireElement(failure)
    )
  })

  it('Goal page of G0: sub-goal rows read "—" and Tickets keeps its sentence and adds Retry', () => {
    const loadState = makeLoadState('error', 'ready')
    const { container } = renderRoute(goalItem(G0), fixture, loadState)
    const subGoals = screen.getByRole('region', { name: 'Sub-goals' })
    expect(subGoals.querySelectorAll(RING)).toHaveLength(0)
    expect(subGoals.querySelectorAll('[data-trivium-work-unknown]')).toHaveLength(
      fixture.model.subGoals(G0).length
    )
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(tickets).toHaveTextContent(
      `All ${fixture.model.descendantTickets(G0).length} tickets sit under sub-goals.`
    )
    expect(tickets).not.toHaveTextContent(/\d+\/\d+ done/)
    expect(within(tickets).getByText("Couldn't load tickets.")).toBeInTheDocument()
    fireEvent.click(within(tickets).getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
    expect(failures(container)).toHaveLength(1)
  })

  it('Ticket page: relation rows, the rail and the composer drop states they cannot know', () => {
    expect(fixture.model.waitingOn('ticket.sync-evaluation').length).toBeGreaterThan(0)
    renderRoute(goalItem('ticket.sync-export'), fixture, makeLoadState('error', 'ready'))
    const requiredBy = screen.getByRole('region', { name: 'Required by' })
    expect(requiredBy).toHaveTextContent(fixture.model.title('ticket.sync-evaluation'))
    expect(requiredBy.querySelector('[data-trivium-waiting]')).toBeNull()
    expect(requiredBy.querySelector('[data-trivium-icon="ticket-status"]')).toBeNull()
    const dependsOn = screen.getByRole('region', { name: 'Depends on' })
    expect(dependsOn.querySelectorAll('[data-trivium-ticket-row]')).toHaveLength(1)
    expect(dependsOn.querySelector('[data-trivium-icon="ticket-status"]')).toBeNull()
    const goal = requireElement(document.querySelector('[data-trivium-property="goal"]'))
    expect(goal).toHaveTextContent(fixture.model.title(G2))
    expect(goal.querySelector(RING)).toBeNull()
    expect(document.querySelector('[data-trivium-composer-context] [data-trivium-icon]')).toBeNull()
  })

  it('ticket list under a Goal: the filter chip drops its ring', () => {
    renderRoute({ view: 'tickets', parentId: G2 }, fixture, makeLoadState('error', 'ready'))
    const chip = requireElement(document.querySelector('[data-trivium-pill="parent-filter"]'))
    expect(chip).toHaveTextContent(`Under ${fixture.model.title(G2)}`)
    expect(chip.querySelector(RING)).toBeNull()
    expect(screen.getByText("Couldn't load tickets.")).toBeInTheDocument()
    cleanup()

    renderRoute({ view: 'tickets', parentId: G2 }, makeReaderFixture('installed'), makeLoadState())
    expect(document.querySelector(`[data-trivium-pill="parent-filter"] ${RING}`)).not.toBeNull()
  })

  it('a Goal without tickets still says the ticket load failed', () => {
    const status = makeSmallTriviumStatus(
      [
        [G0, 'g0', 'adopted'],
        [G2, 'g2', 'adopted']
      ],
      [[G2, G0]]
    )
    const model = buildTriviumModel({ status, tickets: [], progress: null })
    const small = { model, entries: buildTriviumTreeEntries(model) }
    const loadState = makeLoadState('error', 'ready')
    const { container } = renderRoute(goalItem(G2), small, loadState)
    expect(screen.queryByRole('region', { name: 'Tickets' })).toBeNull()
    expect(workPill(container)).toHaveTextContent(/^Work —$/)
    const block = requireElement(
      container.querySelector('[data-trivium-section="tickets-pending"]')
    )
    fireEvent.click(within(block).getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
    cleanup()

    for (const state of ['loading', 'ready'] as const) {
      const view = renderRoute(goalItem(G2), small, makeLoadState(state, 'ready'))
      expect(view.container.querySelector('[data-trivium-section="tickets-pending"]')).toBeNull()
      cleanup()
    }
  })
})

describe('failed ticket records, HEAD binary (progress recorded the work)', () => {
  const fixture = withoutTicketRecords('head')

  it('keeps the recorded counts and still reports the failure', () => {
    expect(fixture.model.work(G0).source).toBe('recorded-work')
    const { container } = renderRoute(
      { view: 'overview' },
      fixture,
      makeLoadState('error', 'ready')
    )
    for (const row of container.querySelectorAll('[data-trivium-goal-row]')) {
      const id = row.getAttribute('data-trivium-goal-row') ?? ''
      expect(row.querySelector('[data-trivium-work]')).toHaveTextContent(
        triviumWorkText(fixture.model.work(id))
      )
      expect(row.querySelector(RING)).not.toBeNull()
    }
    expect(failures(container)).toHaveLength(1)
    cleanup()

    const goal = renderRoute(goalItem(G2), fixture, makeLoadState('error', 'ready'))
    expect(tile(goal.container).querySelector(RING)).not.toBeNull()
    expect(workPill(goal.container)).toHaveTextContent('Work 10/10 tickets done')
  })
})

describe('ticket records still loading', () => {
  it('a Goal with no tickets of its own pulses its ring and shows a skeleton under the sentence', () => {
    const { container } = renderRoute(
      goalItem(G1_SYNC),
      makeReaderFixture('installed'),
      makeLoadState('loading', 'ready')
    )
    expect(tile(container).querySelector(RING)).toHaveClass('animate-pulse')
    expect(workPill(container)).toBeNull()
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(tickets).toHaveTextContent('All 10 tickets sit under sub-goals.')
    expect(within(tickets).getByRole('status', { name: 'Loading tickets…' })).toBeInTheDocument()
    expect(failures(container)).toEqual([])
  })

  it('recorded work does not wait for ticket records', () => {
    const { container } = renderRoute(
      goalItem(G2),
      makeReaderFixture('head'),
      makeLoadState('loading', 'ready')
    )
    expect(workPill(container)).toHaveTextContent('Work 10/10 tickets done')
    expect(tile(container).querySelector(RING)).not.toHaveClass('animate-pulse')
  })
})
