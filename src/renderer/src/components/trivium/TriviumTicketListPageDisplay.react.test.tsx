// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeTriviumChange, type TriviumChange } from './trivium-change-markers'
import type { TriviumModelInput } from './trivium-goal-model'
import { G0, G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TRIVIUM_TICKET_LIST_STORAGE_KEY } from './trivium-ticket-list-options'
import { TriviumOverview } from './TriviumOverview'
import { TriviumTicketListPage } from './TriviumTicketListPage'

// Verifier (WO-3 r1): Display options when storage throws, the Goal property, Goal grouping
// with parentless tickets, and an empty parent filter.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
beforeEach(() => localStorage.clear())

function renderList(fixture: ReaderFixture = makeReaderFixture(), parentId: string | null = null) {
  const navigation = makeReaderNavigation({ view: 'tickets', parentId })
  const view = renderWithTooltips(
    <TriviumTicketListPage
      model={fixture.model}
      entries={fixture.entries}
      navigation={navigation}
      changes={new Map()}
      loadState={makeLoadState()}
      parentId={parentId}
      currentTicketId={null}
    />
  )
  return { ...view, navigation }
}

function groupKeys(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-trivium-group]')].map(
    (group) => group.getAttribute('data-trivium-group') ?? ''
  )
}

function openDisplay(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Display' }))
  return screen.getByRole('dialog', { name: 'Display options' })
}

describe('Display options without working storage', () => {
  it('still applies every choice when getItem and setItem throw', () => {
    // Why a getter stub: a Storage.prototype spy outlives restoreAllMocks in happy-dom.
    const read = vi.fn<(key: string) => string | null>(() => {
      throw new Error('denied')
    })
    const write = vi.fn<(key: string, value: string) => void>(() => {
      throw new Error('quota')
    })
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      removeItem: () => {},
      getItem: read,
      setItem: write
    }
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(throwing)
    const { container } = renderList()
    expect(read).toHaveBeenCalledWith(TRIVIUM_TICKET_LIST_STORAGE_KEY)
    expect(groupKeys(container)).toEqual(['status:open', 'status:approval', 'status:done'])
    const display = openDisplay()
    fireEvent.click(within(display).getByRole('radio', { name: 'Goal' }))
    expect(write).toHaveBeenCalled()
    expect(groupKeys(container)).toEqual([`goal:${G1_SEARCH}`, `goal:${G2}`])
    fireEvent.click(within(display).getByRole('switch', { name: 'Show done tickets' }))
    expect(container.querySelectorAll('[data-trivium-ticket-row]')).toHaveLength(4)
  })

  it('still renders when reading localStorage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { container } = renderList()
    expect(groupKeys(container)).toEqual(['status:open', 'status:approval', 'status:done'])
    fireEvent.click(within(openDisplay()).getByRole('radio', { name: 'None' }))
    expect(groupKeys(container)).toEqual(['all'])
  })
})

describe('Display properties', () => {
  it('hides the goal pill when the Goal property is off and keeps that choice', () => {
    const { container } = renderList()
    const goalPills = (): number =>
      container.querySelectorAll('[data-trivium-ticket-row] [data-trivium-icon="progress-ring"]')
        .length
    expect(goalPills()).toBe(14)
    fireEvent.click(within(openDisplay()).getByRole('button', { name: 'Goal' }))
    expect(goalPills()).toBe(0)
    expect(JSON.parse(localStorage.getItem(TRIVIUM_TICKET_LIST_STORAGE_KEY) ?? '{}')).toMatchObject(
      { properties: { id: false, goal: false, commit: true } }
    )
    cleanup()
    const again = renderList()
    expect(
      again.container.querySelectorAll(
        '[data-trivium-ticket-row] [data-trivium-icon="progress-ring"]'
      )
    ).toHaveLength(0)
  })

  it('has no column header row', () => {
    const { container } = renderList()
    expect(screen.queryAllByRole('columnheader')).toEqual([])
    expect(container.querySelector('table, thead, [role="row"]')).toBeNull()
  })
})

describe('change markers in rows', () => {
  it('puts the new or changed dot at the start of the row', () => {
    const fixture = makeReaderFixture()
    const changes = new Map<string, TriviumChange>([
      ['ticket.sync-export', { kind: 'new' }],
      [
        'ticket.export-cutoff',
        { kind: 'changed', fields: [{ field: 'title', from: 'a', to: 'b' }] }
      ]
    ])
    const { container } = renderWithTooltips(
      <TriviumTicketListPage
        model={fixture.model}
        entries={fixture.entries}
        navigation={makeReaderNavigation({ view: 'tickets', parentId: null })}
        changes={changes}
        loadState={makeLoadState()}
        parentId={null}
        currentTicketId={null}
      />
    )
    const dotOf = (id: string): Element | null =>
      container.querySelector(`[data-trivium-ticket-row="${id}"] [data-trivium-change]`)
    expect(dotOf('ticket.sync-export')).toHaveAttribute('data-trivium-change', 'new')
    expect(dotOf('ticket.sync-export')).toHaveAccessibleName('New since your last visit')
    expect(dotOf('ticket.export-cutoff')).toHaveAttribute('data-trivium-change', 'changed')
    expect(dotOf('ticket.export-cutoff')).toHaveAccessibleName(
      `Changed: ${describeTriviumChange(changes.get('ticket.export-cutoff') ?? { kind: 'new' }, fixture.model.title)}`
    )
    expect(dotOf('ticket.sync-baseline')).toBeNull()
    const row = requireElement(
      container.querySelector('[data-trivium-ticket-row="ticket.sync-export"]')
    )
    expect(row.firstElementChild?.querySelector('[data-trivium-change]')).not.toBeNull()
  })

  it('marks a changed proposal in Needs you', () => {
    const fixture = makeReaderFixture()
    const { container } = renderWithTooltips(
      <TriviumOverview
        model={fixture.model}
        entries={fixture.entries}
        navigation={makeReaderNavigation()}
        changes={new Map<string, TriviumChange>([['ticket.export-cutoff', { kind: 'new' }]])}
        loadState={makeLoadState()}
      />
    )
    const rows = [...container.querySelectorAll('[data-trivium-needs-you="candidate"]')]
    expect(rows.map((row) => row.querySelector('[data-trivium-change]') !== null)).toEqual([
      true,
      false,
      false
    ])
  })
})

describe('grouping and filters on edited fixtures', () => {
  it('puts parentless tickets in a last "No parent goal" group', () => {
    const loose = ['ticket.search-overlap-check']
    const fixture = makeReaderFixture('head', undefined, (input: TriviumModelInput) => ({
      ...input,
      status: {
        ...input.status,
        goals: {
          ...input.status.goals,
          edges: input.status.goals.edges.filter(
            (edge) => !(edge.relation === 'contributes-to' && loose.includes(edge.source))
          )
        }
      }
    }))
    const { container } = renderList(fixture)
    fireEvent.click(within(openDisplay()).getByRole('radio', { name: 'Goal' }))
    expect(groupKeys(container)).toEqual([`goal:${G1_SEARCH}`, `goal:${G2}`, 'goal:none'])
    const last = requireElement(container.querySelector('[data-trivium-group="goal:none"]'))
    expect(within(last).getAllByRole('button')[0]).toHaveTextContent('No parent goal1')
    expect(
      last.querySelector('[data-trivium-ticket-row="ticket.search-overlap-check"]')
    ).not.toBeNull()
  })

  it('says a Goal has no tickets yet under an empty parent filter', () => {
    const empty = 'goal.empty-outcome'
    const fixture = makeReaderFixture('head', undefined, (input: TriviumModelInput) => ({
      ...input,
      status: {
        ...input.status,
        goals: {
          ...input.status.goals,
          nodes: [
            ...input.status.goals.nodes,
            {
              id: empty,
              tier: 'g1',
              title: 'An outcome with no tickets',
              statement: '',
              status: 'adopted'
            }
          ],
          edges: [
            ...input.status.goals.edges,
            { id: 'goal-edge.empty', source: empty, target: G0, relation: 'contributes-to' }
          ]
        }
      }
    }))
    const { container } = renderList(fixture, empty)
    expect(screen.getByRole('heading', { level: 2, name: 'Tickets' })).toBeInTheDocument()
    expect(container.querySelector('[data-trivium-ticket-count]')).toHaveTextContent('0')
    expect(container).toHaveTextContent('No tickets under this goal yet.')
    expect(screen.getByText(/^Under An outcome with no tickets/)).toBeInTheDocument()
  })
})
