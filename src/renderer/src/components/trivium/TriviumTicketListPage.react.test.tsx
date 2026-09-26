// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement
} from './trivium-reader-test-harness'
import {
  makeReaderFixture,
  withTicketStates,
  type ReaderFixture
} from './trivium-reader-model.fixture'
import { TRIVIUM_TICKET_LIST_STORAGE_KEY } from './trivium-ticket-list-options'
import { TriviumTicketListPage } from './TriviumTicketListPage'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
beforeEach(() => localStorage.clear())

function renderList({
  fixture = makeReaderFixture(),
  parentId = null,
  loadState = makeLoadState(),
  currentTicketId = null
}: {
  fixture?: ReaderFixture
  parentId?: string | null
  loadState?: TriviumReaderLoadState
  currentTicketId?: string | null
} = {}) {
  const navigation = makeReaderNavigation({ view: 'tickets', parentId })
  const view = renderWithTooltips(
    <TriviumTicketListPage
      model={fixture.model}
      entries={fixture.entries}
      navigation={navigation}
      changes={new Map()}
      loadState={loadState}
      parentId={parentId}
      currentTicketId={currentTicketId}
    />
  )
  return { ...view, navigation, fixture }
}

function groupKeys(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-trivium-group]')].map(
    (group) => group.getAttribute('data-trivium-group') ?? ''
  )
}

function rowIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-trivium-ticket-row]')].map(
    (row) => row.getAttribute('data-trivium-ticket-row') ?? ''
  )
}

function openDisplay(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Display' }))
  return screen.getByRole('dialog', { name: 'Display options' })
}

// Every kind once: in progress, blocked, open, approval, done and abandoned.
const MIXED = withTicketStates({
  'ticket.sync-journal': 'in-progress',
  'ticket.sync-refresh': 'blocked',
  'ticket.sync-evaluation': 'abandoned'
})

describe('ticket list groups', () => {
  it.each(['head', 'installed'] as const)(
    'lists every shown ticket of the %s fixture',
    (binary) => {
      const fixture = makeReaderFixture(binary)
      const { container } = renderList({ fixture })
      expect(rowIds(container).toSorted()).toEqual(fixture.model.ticketIds.toSorted())
      expect(groupKeys(container)).toEqual(['status:open', 'status:approval', 'status:done'])
      expect(container.querySelectorAll('[data-trivium-commit]')).toHaveLength(13)
    }
  )

  it('groups by status in Linear list order and hides empty groups', () => {
    const { container } = renderList()
    expect(screen.getByRole('heading', { level: 2, name: 'All tickets' })).toBeInTheDocument()
    expect(container.querySelector('[data-trivium-ticket-count]')).toHaveTextContent('14')
    expect(groupKeys(container)).toEqual(['status:open', 'status:approval', 'status:done'])
    cleanup()
    const mixed = renderList({ fixture: makeReaderFixture('head', MIXED) })
    expect(groupKeys(mixed.container)).toEqual([
      'status:in-progress',
      'status:blocked',
      'status:open',
      'status:approval',
      'status:done',
      'status:abandoned'
    ])
    const header = within(
      requireElement(mixed.container.querySelector('[data-trivium-group="status:in-progress"]'))
    ).getAllByRole('button')[0]
    expect(header).toHaveTextContent('In progress1')
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  it('folds a group from its band header', () => {
    const { container } = renderList()
    const done = requireElement(container.querySelector('[data-trivium-group="status:done"]'))
    const header = within(done).getAllByRole('button')[0]
    expect(done.querySelectorAll('[data-trivium-ticket-row]')).toHaveLength(10)
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(done.querySelectorAll('[data-trivium-ticket-row]')).toHaveLength(0)
  })

  it('shows the waiting pill only while a dependency is not done', () => {
    const fixture = makeReaderFixture(
      'head',
      withTicketStates({ 'ticket.sync-baseline': 'in-progress', 'ticket.sync-journal': 'open' })
    )
    const { container } = renderList({ fixture })
    const waiting = container.querySelector(
      '[data-trivium-ticket-row="ticket.sync-journal"] [data-trivium-waiting]'
    )
    expect(waiting).toHaveAttribute('data-trivium-waiting', '1')
    expect(waiting).toHaveTextContent('Waiting on 1')
    expect(waiting?.firstElementChild).toHaveClass('text-trivium-blocked')
    // A done dependent does not wait any more, even on an unfinished dependency.
    expect(
      container.querySelector(
        '[data-trivium-ticket-row="ticket.sync-refresh"] [data-trivium-waiting]'
      )
    ).toBeNull()
  })

  it('opens a ticket from its row and highlights the one opened last', () => {
    const { container, navigation } = renderList({ currentTicketId: 'ticket.sync-export' })
    const current = container.querySelector('[data-trivium-ticket-row="ticket.sync-export"]')
    expect(current).toHaveAttribute('data-current', 'true')
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current).toHaveClass('data-[current=true]:bg-trivium-row-selected')
    fireEvent.click(
      requireElement(container.querySelector('[data-trivium-ticket-row="goal.export-write-check"]'))
    )
    expect(navigation.openItem).toHaveBeenLastCalledWith('goal.export-write-check')
  })
})

describe('Display options', () => {
  it('regroups by Goal in outline order, or not at all', () => {
    const { container } = renderList()
    const display = openDisplay()
    fireEvent.click(within(display).getByRole('radio', { name: 'Goal' }))
    expect(groupKeys(container)).toEqual([`goal:${G1_SEARCH}`, `goal:${G2}`])
    fireEvent.click(within(display).getByRole('radio', { name: 'None' }))
    expect(groupKeys(container)).toEqual(['all'])
    expect(container.querySelector('[data-trivium-group="all"] > button')).toBeNull()
    expect(rowIds(container)).toHaveLength(14)
  })

  it('orders by title and shows the ID column when asked', () => {
    const { container, fixture } = renderList()
    const display = openDisplay()
    fireEvent.click(within(display).getByRole('radio', { name: 'None' }))
    const goalOrder = rowIds(container)
    expect(goalOrder[0]).toBe('ticket.index-reads-once')
    fireEvent.click(within(display).getByRole('radio', { name: 'Title' }))
    const titles = rowIds(container).map((id) => fixture.model.title(id))
    expect(titles).toEqual(titles.toSorted(new Intl.Collator(undefined, { numeric: true }).compare))
    expect(container).not.toHaveTextContent('sync-baseline')
    fireEvent.click(within(display).getByRole('button', { name: 'ID' }))
    expect(
      container.querySelector('[data-trivium-ticket-row="ticket.sync-baseline"]')
    ).toHaveTextContent('sync-baseline')
  })

  it('hides done tickets and remembers every choice', () => {
    const { container } = renderList({ fixture: makeReaderFixture('head', MIXED) })
    const display = openDisplay()
    fireEvent.click(within(display).getByRole('switch', { name: 'Show done tickets' }))
    expect(groupKeys(container)).toEqual([
      'status:in-progress',
      'status:blocked',
      'status:open',
      'status:approval'
    ])
    fireEvent.click(within(display).getByRole('radio', { name: 'Title' }))
    fireEvent.click(within(display).getByRole('button', { name: 'Commit' }))
    expect(JSON.parse(localStorage.getItem(TRIVIUM_TICKET_LIST_STORAGE_KEY) ?? '{}')).toEqual({
      grouping: 'status',
      ordering: 'title',
      properties: { id: false, goal: true, commit: false },
      showDone: false
    })
    cleanup()
    const again = renderList({ fixture: makeReaderFixture('head', MIXED) })
    expect(groupKeys(again.container)).not.toContain('status:done')
    expect(again.container.querySelector('[data-trivium-commit]')).toBeNull()
  })

  it('falls back to the defaults when storage holds garbage', () => {
    localStorage.setItem(TRIVIUM_TICKET_LIST_STORAGE_KEY, '{"grouping":"sideways","showDone":"no"}')
    const { container } = renderList()
    expect(groupKeys(container)).toEqual(['status:open', 'status:approval', 'status:done'])
    expect(container.querySelector('[data-trivium-commit]')).not.toBeNull()
  })
})

describe('parent filter and search', () => {
  it("shows one Goal's tickets under a removable chip", () => {
    const { container, navigation } = renderList({ parentId: G2 })
    expect(screen.getByRole('heading', { level: 2, name: 'Tickets' })).toBeInTheDocument()
    expect(container.querySelector('[data-trivium-ticket-count]')).toHaveTextContent('10')
    expect(screen.getByText(/^Under 첫 동기화 단계/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all tickets' }))
    expect(navigation.openTickets).toHaveBeenLastCalledWith(null)
  })

  it('searches titles, statements and ids', () => {
    const { container } = renderList()
    const search = screen.getByRole('searchbox', { name: 'Search tickets' })
    act(() => {
      fireEvent.change(search, { target: { value: 'FOLD LINE' } })
    })
    expect(rowIds(container)).toEqual(['ticket.trim-keeps-marker'])
    fireEvent.change(search, { target: { value: 'index-reads' } })
    expect(rowIds(container)).toEqual(['ticket.index-reads-once'])
    fireEvent.change(search, { target: { value: '스무 가지 동기화' } })
    expect(rowIds(container).length).toBeGreaterThan(0)
    fireEvent.change(search, { target: { value: 'no ticket says this' } })
    expect(rowIds(container)).toEqual([])
    expect(container).toHaveTextContent('No tickets match.')
    expect(container.querySelector('[data-trivium-ticket-count]')).toHaveTextContent('0')
  })
})

describe('ticket list while ticket records load', () => {
  it('shows a placeholder, then the failure with Retry', () => {
    const { container } = renderList({ loadState: makeLoadState('loading', 'ready') })
    expect(screen.getByRole('status', { name: 'Loading tickets…' })).toBeInTheDocument()
    expect(rowIds(container)).toEqual([])
    cleanup()
    const loadState = makeLoadState('error', 'ready')
    renderList({ loadState })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
    expect(screen.getByText("Couldn't load tickets.")).toBeInTheDocument()
  })
})
