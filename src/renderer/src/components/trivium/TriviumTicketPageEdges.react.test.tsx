// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TriviumModelInput } from './trivium-goal-model'
import { triviumTreeOrder } from './trivium-goal-tree'
import { fixtureApproveCommand, G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement,
  stubClipboard
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TriviumTicketPage } from './TriviumTicketPage'

// Verifier (WO-3 r1): pager order against the outline, unparented siblings, and when the
// approval callout may and may not appear.

afterEach(cleanup)
beforeEach(() => {
  stubClipboard()
})

function renderTicket(id: string, fixture: ReaderFixture = makeReaderFixture()) {
  const navigation = makeReaderNavigation({ view: 'item', id, anchor: null })
  const onAskAgent = vi.fn<(draft: string) => void>()
  const view = renderWithTooltips(
    <TriviumTicketPage
      model={fixture.model}
      id={id}
      entries={fixture.entries}
      navigation={navigation}
      changes={new Map()}
      loadState={makeLoadState()}
      onAskAgent={onAskAgent}
    />
  )
  return { ...view, navigation, onAskAgent }
}

function property(container: HTMLElement, name: string): HTMLElement {
  return requireElement(container.querySelector(`[data-trivium-property="${name}"] dd`))
}

function pager(container: HTMLElement): HTMLElement {
  return requireElement(container.querySelector('[data-trivium-pager]'))
}

function withoutParents(ids: readonly string[]) {
  return (input: TriviumModelInput): TriviumModelInput => ({
    ...input,
    status: {
      ...input.status,
      goals: {
        ...input.status.goals,
        edges: input.status.goals.edges.filter(
          (edge) => !(edge.relation === 'contributes-to' && ids.includes(edge.source))
        )
      }
    },
    tickets: input.tickets.map((ticket) =>
      ids.includes(ticket.id) ? { ...ticket, parent: null } : ticket
    )
  })
}

describe.each(['head', 'installed'] as const)('ticket pager on the %s fixture', (binary) => {
  it.each([G2, G1_SEARCH])('follows the outline order of the tickets under %s', (parent) => {
    const fixture = makeReaderFixture(binary)
    const outline = [...triviumTreeOrder(fixture.entries).keys()].filter(
      (id) => fixture.model.isTicket(id) && fixture.model.parent(id) === parent
    )
    expect(outline).toHaveLength(fixture.model.directTickets(parent).length)
    outline.forEach((id, index) => {
      const { container, navigation } = renderTicket(id, fixture)
      const bar = pager(container)
      expect(bar).toHaveTextContent(`${index + 1} / ${outline.length}`)
      const previous = within(bar).getByRole('button', { name: 'Previous ticket' })
      const next = within(bar).getByRole('button', { name: 'Next ticket' })
      if (index === 0) {
        expect(previous).toBeDisabled()
      } else {
        fireEvent.click(previous)
        expect(navigation.openItem).toHaveBeenLastCalledWith(outline[index - 1])
      }
      if (index === outline.length - 1) {
        expect(next).toBeDisabled()
      } else {
        fireEvent.click(next)
        expect(navigation.openItem).toHaveBeenLastCalledWith(outline[index + 1])
      }
      cleanup()
    })
  })
})

describe('tickets without a parent Goal', () => {
  const loose = ['ticket.search-overlap-check', 'ticket.search-awaiting-view']
  const fixture = makeReaderFixture('head', undefined, withoutParents(loose))

  it('page through the unparented tickets', () => {
    const order = fixture.model.unparentedTickets
    expect([...order].toSorted()).toEqual(loose.toSorted())
    const first = renderTicket(order[0], fixture)
    expect(pager(first.container)).toHaveTextContent('1 / 2')
    expect(
      within(pager(first.container)).getByRole('button', { name: 'Previous ticket' })
    ).toBeDisabled()
    fireEvent.click(within(pager(first.container)).getByRole('button', { name: 'Next ticket' }))
    expect(first.navigation.openItem).toHaveBeenLastCalledWith(order[1])
    expect(screen.getByRole('navigation', { name: 'Goal path' })).toHaveTextContent('Goals')
    expect(property(first.container, 'goal')).toHaveTextContent('—')
    cleanup()
    const last = renderTicket(order[1], fixture)
    expect(pager(last.container)).toHaveTextContent('2 / 2')
    expect(
      within(pager(last.container)).getByRole('button', { name: 'Next ticket' })
    ).toBeDisabled()
  })

  it('explains approval without a parent name for an unparented proposal', () => {
    const orphan = makeReaderFixture('head', undefined, withoutParents(['ticket.index-reads-once']))
    const { container } = renderTicket('ticket.index-reads-once', orphan)
    const callout = requireElement(container.querySelector('[data-trivium-approval]'))
    expect(callout).toHaveTextContent(
      'Approving adopts this proposed ticket. Until then it is not part of the Goal model.'
    )
  })
})

describe.each(['head', 'installed'] as const)('approval callout on the %s fixture', (binary) => {
  it('stays off an adopted ticket even when a stale proposal command exists', () => {
    const fixture = makeReaderFixture(binary)
    const id = 'ticket.search-awaiting-view'
    expect(fixture.model.approveCommand(id)).not.toBeNull()
    const { container } = renderTicket(id, fixture)
    expect(container.querySelector('[data-trivium-approval]')).toBeNull()
    expect(container.querySelector('[data-trivium-approve-command]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask the agent to approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy command' })).toBeNull()
    expect(property(container, 'approval')).toHaveTextContent('Adopted')
  })

  it('shows the status approve command, not the derived ratify spelling', () => {
    const { container } = renderTicket('ticket.index-reads-once', makeReaderFixture(binary))
    expect(container.querySelector('[data-trivium-approve-command]')).toHaveTextContent(
      fixtureApproveCommand('ticket.index-reads-once')
    )
  })

  it('treats an adopted record awaiting approval as waiting, never as adopted', () => {
    const fixture = makeReaderFixture(binary, (ticket) =>
      ticket.id === 'ticket.sync-export' ? { ...ticket, awaiting: 'approve' } : ticket
    )
    const { container } = renderTicket('ticket.sync-export', fixture)
    expect(container.querySelector('[data-trivium-approval]')).not.toBeNull()
    expect(property(container, 'approval')).toHaveTextContent('Needs approval')
    expect(property(container, 'approval')).not.toHaveTextContent('Adopted')
    expect(container).not.toHaveTextContent(/\bApproved\b/)
  })

  it('asks for approval without a command when trivium sent none', () => {
    const id = 'ticket.trim-keeps-marker'
    const fixture = makeReaderFixture(
      binary,
      (ticket) => (ticket.id === id ? { ...ticket, approve: null } : ticket),
      (input) => ({
        ...input,
        status: {
          ...input.status,
          tickets: {
            ...input.status.tickets,
            candidates: input.status.tickets.candidates.map((item) =>
              item.id === id ? { ...item, approve_command: '' } : item
            )
          }
        },
        progress: input.progress && {
          ...input.progress,
          goals: input.progress.goals.map((goal) => ({
            ...goal,
            derivedOutcomes: goal.derivedOutcomes.map((outcome) =>
              outcome.ticketId === id ? { ...outcome, approve: null } : outcome
            )
          }))
        }
      })
    )
    expect(fixture.model.approveCommand(id)).toBeNull()
    const { container, onAskAgent } = renderTicket(id, fixture)
    const callout = requireElement(container.querySelector('[data-trivium-approval]'))
    expect(callout.querySelector('[data-trivium-approve-command]')).toBeNull()
    expect(within(callout).queryByRole('button', { name: 'Copy command' })).toBeNull()
    fireEvent.click(within(callout).getByRole('button', { name: 'Ask the agent to approve' }))
    expect(onAskAgent).toHaveBeenCalledOnce()
    expect(onAskAgent.mock.calls[0][0]).toContain("Adopt it with trivium's ticket approve command")
  })
})

describe('ticket rail and layout', () => {
  it('fills the rail of an open ticket that nothing delivered yet', () => {
    const { container } = renderTicket('goal.export-write-check')
    expect(property(container, 'status')).toHaveTextContent('Open')
    expect(property(container, 'approval')).toHaveTextContent('Adopted')
    expect(property(container, 'goal')).toHaveTextContent(
      'Search와 export가 하나의 색인을 공유한다'
    )
    expect(property(container, 'merged')).toHaveTextContent('—')
    expect(property(container, 'depends-on')).toHaveTextContent('None')
    expect(property(container, 'required-by')).toHaveTextContent('None')
    expect(property(container, 'id')).toHaveTextContent('export-write-check')
    expect(property(container, 'files')).toHaveTextContent('0')
    expect(container.querySelector('[data-trivium-section="delivered-by"]')).toBeNull()
    expect(container.querySelector('[data-trivium-section="files"]')).toBeNull()
  })

  it('copies the full ticket id from the rail', async () => {
    const clipboard = stubClipboard()
    const { container } = renderTicket('goal.export-write-check')
    expect(property(container, 'id')).toHaveTextContent(/^export-write-check$/)
    fireEvent.click(screen.getByRole('button', { name: 'Copy ID' }))
    await screen.findByText('Copied')
    expect(clipboard).toHaveBeenCalledWith('goal.export-write-check')
  })

  it('puts the 248px rail beside the main column only from 820px of reader width', () => {
    const { container } = renderTicket('ticket.export-cutoff')
    const rail = requireElement(screen.getByRole('complementary', { name: 'Ticket properties' }))
    const grid = requireElement(rail.parentElement)
    expect(grid).toHaveClass(
      'grid',
      'grid-cols-1',
      '@min-[820px]/reader:grid-cols-[minmax(0,1fr)_248px]'
    )
    expect(grid.firstElementChild).toHaveClass('min-w-0')
    expect(grid.lastElementChild).toBe(rail)
    expect(container.querySelector('[data-trivium-page="ticket"]')).not.toBeNull()
  })
})
