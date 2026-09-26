// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TriviumChange } from './trivium-change-markers'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import { triviumWorkText } from './trivium-reader-text'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement,
  sectionNames,
  stubClipboard
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TriviumGoalPage } from './TriviumGoalPage'

afterEach(cleanup)
let clipboard: ReturnType<typeof stubClipboard>
beforeEach(() => {
  clipboard = stubClipboard()
})

function renderGoal(
  id: string,
  fixture: ReaderFixture = makeReaderFixture(),
  loadState: TriviumReaderLoadState = makeLoadState(),
  changes: ReadonlyMap<string, TriviumChange> = new Map(),
  currentTicketId: string | null = null
) {
  const navigation = makeReaderNavigation({ view: 'item', id, anchor: null })
  const view = renderWithTooltips(
    <TriviumGoalPage
      model={fixture.model}
      id={id}
      entries={fixture.entries}
      navigation={navigation}
      changes={changes}
      loadState={loadState}
      currentTicketId={currentTicketId}
    />
  )
  return { ...view, navigation, fixture }
}

function pill(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector(`[data-trivium-pill="${name}"]`)
}

describe.each(['head', 'installed'] as const)('Goal page on the %s fixture', (binary) => {
  it('reads like a Linear project header: path, tier, title and property pills', () => {
    const { container, navigation, fixture } = renderGoal(G2, makeReaderFixture(binary))
    const path = screen.getByRole('navigation', { name: 'Goal path' })
    expect(
      within(path)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual([
      'Notes stay usable',
      'Sync keeps every confirmed edit and says plainly what it could not merge'
    ])
    fireEvent.click(within(path).getByRole('button', { name: 'Notes stay usable' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G0)

    expect(screen.getByText('G2 · Campaign outcome')).toHaveClass('uppercase')
    const title = screen.getByRole('heading', { level: 2 })
    expect(title).toHaveTextContent(/^첫 동기화 단계/)
    expect(title).toHaveClass('break-keep', 'wrap-anywhere')

    expect(pill(container, 'outcome')).toHaveTextContent('Outcome Not assessed')
    expect(
      pill(container, 'outcome')?.querySelector('[data-trivium-icon="outcome"]')
    ).toHaveAttribute('data-value', 'unassessed')
    expect(pill(container, 'work')).toHaveTextContent(
      `Work ${triviumWorkText(fixture.model.work(G2))}`
    )
    expect(pill(container, 'work')).toHaveTextContent('Work 10/10 tickets done')
    expect(pill(container, 'milestones')).toHaveTextContent('2 milestones')
    expect(pill(container, 'status')).toBeNull()
    expect(container.querySelector('[data-trivium-goal-relations]')).toBeNull()
    fireEvent.click(requireElement(pill(container, 'parent')))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G1_SYNC)
    expect(container.querySelector('[data-trivium-criteria="none"]')).toHaveTextContent(
      'Success criteria · No success criteria recorded yet.'
    )
  })

  it('shows its own milestones as update cards, latest first, and no sub-goal milestones', () => {
    const { container } = renderGoal(G2, makeReaderFixture(binary))
    const latest = container.querySelector('[data-trivium-section="latest-milestone"]')
    expect(latest).toHaveAttribute('data-trivium-anchor', 'updates')
    const cards = [...(latest?.querySelectorAll('[data-trivium-milestone]') ?? [])]
    expect(cards.map((card) => card.getAttribute('data-trivium-milestone'))).toEqual([
      'campaign.sync-contradictions',
      'campaign.sync-first-slice'
    ])
    expect(cards[0]).toHaveTextContent('2 contradictions')
    expect(cards[0]).toHaveTextContent('1 drift')
    expect(cards[0]).toHaveTextContent('4 trade-offs')
    expect(cards[0]).toHaveTextContent('2 promotion candidates')
    expect(container.querySelector('[data-trivium-section="sub-goal-milestones"]')).toBeNull()

    const card = requireElement(cards[0])
    expect(card.querySelector('[data-trivium-milestone-detail]')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Read full milestone' }))
    const detail = requireElement(card.querySelector('[data-trivium-milestone-detail]'))
    expect(detail).toHaveTextContent('Drift1')
    expect(detail).toHaveTextContent('Trade-offs4')
    expect(detail).toHaveTextContent('Promotion candidates2')
    expect(within(card).getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('lists milestones of sub-goals as rows that open that goal at its updates', () => {
    const { container, navigation } = renderGoal(G0, makeReaderFixture(binary))
    const latest = container.querySelector('[data-trivium-section="latest-milestone"]')
    expect(latest?.querySelectorAll('[data-trivium-milestone]')).toHaveLength(1)
    const rows = [...container.querySelectorAll('[data-trivium-sub-goal-milestone]')]
    expect(rows.map((row) => row.getAttribute('data-trivium-sub-goal-milestone'))).toEqual([
      'campaign.sync-first-slice',
      'campaign.sync-contradictions',
      'campaign.ticket-dogfood'
    ])
    fireEvent.click(within(requireElement(rows[2])).getByRole('button'))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G1_SEARCH, 'updates')
  })

  it('says every ticket sits under sub-goals when the goal has none of its own', () => {
    const { container, navigation } = renderGoal(G1_SYNC, makeReaderFixture(binary))
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(tickets).toHaveTextContent('All 10 tickets sit under sub-goals.')
    expect(tickets.querySelector('[data-trivium-ticket-rows]')).toBeNull()
    fireEvent.click(within(tickets).getByRole('button', { name: 'Open in list' }))
    expect(navigation.openTickets).toHaveBeenLastCalledWith(G1_SYNC)
    expect(container.querySelector('[data-trivium-section="latest-milestone"]')).toBeNull()
    expect(container.querySelector('[data-trivium-section="sub-goal-milestones"]')).toHaveAttribute(
      'data-trivium-anchor',
      'updates'
    )
    expect(screen.getByRole('region', { name: 'Sub-goals' })).toHaveTextContent('첫 동기화 단계')
  })

  it('groups its own tickets by status without ID or goal pills and with commit pills', () => {
    const { container, navigation } = renderGoal(G2, makeReaderFixture(binary))
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(tickets).toHaveTextContent('10/10 done')
    const groups = [...tickets.querySelectorAll('[data-trivium-group]')]
    expect(groups.map((group) => group.getAttribute('data-trivium-group'))).toEqual([
      'status:approval',
      'status:done'
    ])
    const rows = tickets.querySelectorAll('[data-trivium-ticket-row]')
    expect(rows).toHaveLength(10)
    expect(tickets.querySelectorAll('[data-trivium-commit]')).toHaveLength(10)
    expect(tickets).not.toHaveTextContent('export-cutoff')
    expect(
      container.querySelectorAll('[data-trivium-ticket-rows] [data-trivium-icon="progress-ring"]')
    ).toHaveLength(0)
    fireEvent.click(rows[0])
    expect(navigation.openItem).toHaveBeenLastCalledWith(
      rows[0].getAttribute('data-trivium-ticket-row')
    )
  })

  it('shows its own unknowns and the technical details', async () => {
    renderGoal(G2, makeReaderFixture(binary))
    const questions = screen.getByRole('region', { name: 'Open questions' })
    expect(questions.querySelectorAll('li')).toHaveLength(3)
    fireEvent.click(within(questions).getByRole('button', { name: 'Show all 6' }))
    expect(questions.querySelectorAll('li')).toHaveLength(6)

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }))
    expect(screen.getByText(G2)).toBeInTheDocument()
    expect(screen.getByText('Features completed').nextElementSibling).toHaveTextContent('10')
    expect(screen.getByText('Tier').nextElementSibling).toHaveTextContent('G2 · Campaign outcome')
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await screen.findByText('Copied')
    expect(clipboard).toHaveBeenCalledWith(G2)
  })
})

describe('Goal page description and markers', () => {
  it('clamps a long description to four lines until Show more', () => {
    const { model } = makeReaderFixture()
    renderGoal(G1_SYNC)
    const statement = model.node(G1_SYNC)?.statement ?? ''
    const body = requireElement(
      screen.getByText(statement.slice(0, 40), { exact: false }).closest('div')
    )
    expect(body).toHaveClass('line-clamp-4', 'break-keep', 'wrap-anywhere')
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(body).not.toHaveClass('line-clamp-4')
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('names what changed since the last visit and a status other than adopted', () => {
    const fixture = makeReaderFixture('head', undefined, (input) => ({
      ...input,
      status: {
        ...input.status,
        goals: {
          ...input.status.goals,
          nodes: input.status.goals.nodes.map((node) =>
            node.id === G2 ? { ...node, status: 'candidate' } : node
          )
        }
      }
    }))
    const changes = new Map<string, TriviumChange>([
      [G2, { kind: 'changed', fields: [{ field: 'tier', from: 'g3', to: 'g2' }] }]
    ])
    const { container } = renderGoal(G2, fixture, makeLoadState(), changes)
    expect(pill(container, 'status')).toHaveTextContent('Candidate')
    expect(pill(container, 'status')).toHaveClass('text-trivium-decision')
    expect(pill(container, 'change')).toHaveTextContent('Tier G3 → G2')
  })

  it('highlights the ticket the user opened last', () => {
    const { container } = renderGoal(
      G2,
      makeReaderFixture(),
      makeLoadState(),
      new Map(),
      'ticket.sync-export'
    )
    const row = container.querySelector('[data-trivium-ticket-row="ticket.sync-export"]')
    expect(row).toHaveAttribute('data-current', 'true')
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(1)
  })
})

describe('Goal page while details load', () => {
  it('shows status data at once and placeholders where tickets and progress go', () => {
    const { container } = renderGoal(G2, makeReaderFixture(), makeLoadState('loading', 'loading'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^첫 동기화 단계/)
    expect(pill(container, 'outcome')).toBeNull()
    expect(pill(container, 'work')).toBeNull()
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(within(tickets).getByRole('status', { name: 'Loading tickets…' })).toBeInTheDocument()
    expect(tickets).not.toHaveTextContent('done')
    expect(sectionNames(container)).toContain('progress-pending')
    expect(sectionNames(container)).not.toContain('latest-milestone')
  })

  it('reports each failed load with Retry', () => {
    const loadState = makeLoadState('error', 'error')
    const { container } = renderGoal(G2, makeReaderFixture(), loadState)
    const failures = [...container.querySelectorAll('[data-trivium-pending="error"]')]
    expect(failures.map((item) => item.textContent)).toEqual([
      "Couldn't load tickets.Retry",
      "Couldn't load progress details.Retry"
    ])
    fireEvent.click(within(requireElement(failures[1])).getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
  })
})
