// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TriviumChange } from './trivium-change-markers'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries, type TriviumTreeEntry } from './trivium-goal-tree'
import {
  FIXTURE_GOALS,
  FIXTURE_TICKETS,
  G0,
  G1_SEARCH,
  G1_SYNC,
  G2
} from './trivium-model-tables.fixture'
import {
  makeSmallTriviumStatus,
  makeTriviumFixtureModel,
  makeTriviumModelInput
} from './trivium-model.fixture'
import { TriviumStructurePane } from './TriviumStructurePane'
import { useTriviumNavigation, type TriviumNavigation } from './use-trivium-navigation'

const titleOf = (id: string): string =>
  FIXTURE_GOALS.find((goal) => goal.id === id)?.title ??
  FIXTURE_TICKETS.find((ticket) => ticket.id === id)?.title ??
  id
const G2_GROUP = `${G0}>${G1_SYNC}>${G2}>${G2}#tickets`

const spies = {
  selectEntry: vi.fn<(entry: TriviumTreeEntry) => void>(),
  toggle: vi.fn<(key: string, open?: boolean) => void>(),
  openOverview: vi.fn<() => void>(),
  openTickets: vi.fn<(parentId: string | null) => void>()
}
const handle: { navigation: TriviumNavigation | null } = { navigation: null }

function Harness({
  model,
  changes,
  needsYouCount
}: {
  model: TriviumModel
  changes: ReadonlyMap<string, TriviumChange>
  needsYouCount: number
}): React.JSX.Element {
  const entries = useMemo(() => buildTriviumTreeEntries(model), [model])
  const navigation = useTriviumNavigation({ storageKey: null, model, entries })
  handle.navigation = navigation
  const spied = useMemo<TriviumNavigation>(
    () => ({
      ...navigation,
      selectEntry: (entry) => {
        spies.selectEntry(entry)
        navigation.selectEntry(entry)
      },
      toggle: (key, open) => {
        spies.toggle(key, open)
        navigation.toggle(key, open)
      },
      openOverview: () => {
        spies.openOverview()
        navigation.openOverview()
      },
      openTickets: (parentId) => {
        spies.openTickets(parentId)
        navigation.openTickets(parentId)
      }
    }),
    [navigation]
  )
  return (
    <TriviumStructurePane
      model={model}
      entries={entries}
      navigation={spied}
      changes={changes}
      needsYouCount={needsYouCount}
      ticketCount={model.ticketIds.length}
    />
  )
}

function renderPane({
  model = makeTriviumFixtureModel(),
  changes = new Map<string, TriviumChange>(),
  needsYouCount = 0
}: {
  model?: TriviumModel
  changes?: ReadonlyMap<string, TriviumChange>
  needsYouCount?: number
} = {}): void {
  render(
    <TooltipProvider>
      <Harness model={model} changes={changes} needsYouCount={needsYouCount} />
    </TooltipProvider>
  )
}

const row = (name: string): HTMLElement => screen.getByRole('treeitem', { name })
const openGroup = (name: string): void => {
  fireEvent.click(within(row(name)).getByRole('button', { name: 'Expand' }))
}
function focused(): HTMLElement {
  if (!(document.activeElement instanceof HTMLElement)) {
    throw new Error('nothing has focus')
  }
  return document.activeElement
}
function required(element: Element | null): Element {
  if (!element) {
    throw new Error('element missing')
  }
  return element
}
const press = (key: string): void => {
  fireEvent.keyDown(focused(), { key })
}

beforeEach(() => {
  for (const spy of Object.values(spies)) {
    spy.mockClear()
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  handle.navigation = null
})

describe('TriviumStructurePane tree', () => {
  it('opens every Goal and keeps the ticket groups closed at first', () => {
    renderPane()
    const items = screen.getAllByRole('treeitem')
    expect(items).toEqual([
      row(titleOf(G0)),
      row(titleOf(G1_SEARCH)),
      row('4 tickets'),
      row(titleOf(G1_SYNC)),
      row(titleOf(G2)),
      row('10 tickets')
    ])
    // level:position/set size
    expect(
      items.map(
        (item) =>
          `${item.getAttribute('aria-level')}:${item.getAttribute('aria-posinset')}/${item.getAttribute('aria-setsize')}`
      )
    ).toEqual(['1:1/1', '2:1/2', '3:1/1', '2:2/2', '3:1/1', '4:1/1'])
    expect(items.map((item) => item.getAttribute('aria-expanded'))).toEqual([
      'true',
      'true',
      'false',
      'true',
      'true',
      'false'
    ])
    // The tier column: G0-G2 for Goals, G3 on ticket groups.
    expect(items.map((item) => item.lastElementChild?.textContent)).toEqual([
      'G0',
      'G1',
      'G3',
      'G1',
      'G2',
      'G3'
    ])
  })

  it('marks up one tree with a single tab stop, selection, and expansion only on rows that open', () => {
    renderPane()
    expect(screen.getByRole('tree', { name: 'Goals and tickets' })).toBeInTheDocument()
    const items = screen.getAllByRole('treeitem')
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[0]])
    expect(items.every((item) => item.getAttribute('aria-selected') === 'false')).toBe(true)

    openGroup('10 tickets')
    const ticket = row(titleOf('ticket.sync-export'))
    expect(ticket).toHaveAttribute('aria-level', '5')
    expect(ticket).not.toHaveAttribute('aria-expanded')
    fireEvent.click(ticket)
    expect(ticket).toHaveAttribute('aria-selected', 'true')
    expect(ticket).toHaveAttribute('data-current', 'true')
    expect(ticket.tabIndex).toBe(0)
    expect(screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0)).toHaveLength(1)
  })

  it('moves and selects with ↑ ↓ Home End', () => {
    renderPane()
    row(titleOf(G0)).focus()
    press('ArrowDown')
    expect(focused()).toBe(row(titleOf(G1_SEARCH)))
    expect(focused()).toHaveAttribute('aria-selected', 'true')
    expect(spies.selectEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: `${G0}>${G1_SEARCH}` })
    )
    press('ArrowUp')
    expect(focused()).toBe(row(titleOf(G0)))
    press('End')
    expect(focused()).toBe(row('10 tickets'))
    expect(handle.navigation?.route).toEqual({ view: 'tickets', parentId: G2 })
    press('Home')
    expect(focused()).toBe(row(titleOf(G0)))
    expect(handle.navigation?.route).toEqual({ view: 'item', id: G0, anchor: null })
  })

  it('opens with → then steps in, and steps out with ← then closes', () => {
    renderPane()
    const group = row('10 tickets')
    group.focus()
    press('ArrowRight')
    expect(group).toHaveAttribute('aria-expanded', 'true')
    expect(spies.selectEntry).not.toHaveBeenCalled()
    press('ArrowRight')
    // Dependency order: the baseline every other G2 ticket builds on comes first.
    const first = row(titleOf('ticket.sync-baseline'))
    expect(focused()).toBe(first)
    expect(first).toHaveAttribute('aria-selected', 'true')
    press('ArrowRight')
    expect(focused()).toBe(first)
    press('ArrowLeft')
    expect(focused()).toBe(group)
    expect(group).toHaveAttribute('aria-selected', 'true')
    press('ArrowLeft')
    expect(group).toHaveAttribute('aria-expanded', 'false')
    press('ArrowLeft')
    expect(focused()).toBe(row(titleOf(G2)))
  })

  it('toggles with Enter and Space and selects a ticket with Enter', () => {
    renderPane()
    const goal = row(titleOf(G2))
    goal.focus()
    press('Enter')
    expect(goal).toHaveAttribute('aria-expanded', 'false')
    press(' ')
    expect(goal).toHaveAttribute('aria-expanded', 'true')
    expect(spies.toggle.mock.calls).toEqual([
      [`${G0}>${G1_SYNC}>${G2}`, false],
      [`${G0}>${G1_SYNC}>${G2}`, true]
    ])
    expect(spies.selectEntry).not.toHaveBeenCalled()
    openGroup('10 tickets')
    const ticket = row(titleOf('ticket.sync-export'))
    ticket.focus()
    press('Enter')
    expect(handle.navigation?.route).toEqual({
      view: 'item',
      id: 'ticket.sync-export',
      anchor: null
    })
  })

  it('toggles from the glyph and the sub-line without selecting the row', () => {
    renderPane()
    const goal = row(titleOf(G2))
    fireEvent.click(within(goal).getByRole('button', { name: 'Collapse' }))
    expect(goal).toHaveAttribute('aria-expanded', 'false')
    expect(goal).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('treeitem', { name: '10 tickets' })).toBeNull()
    // Focus outside the tree stays put; inside it, it follows the toggled row.
    expect(focused()).toBe(document.body)
    row(titleOf(G0)).focus()
    fireEvent.click(within(goal).getByRole('button', { name: '10 tickets' }))
    expect(focused()).toBe(goal)
    expect(goal.tabIndex).toBe(0)
    expect(goal).toHaveAttribute('aria-expanded', 'true')
    expect(spies.selectEntry).not.toHaveBeenCalled()
    expect(spies.toggle).toHaveBeenCalledTimes(2)
  })

  it('selects a Goal or ticket when its title is clicked', () => {
    renderPane()
    fireEvent.click(screen.getByText(titleOf(G1_SYNC)))
    expect(spies.selectEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'goal', id: G1_SYNC })
    )
    expect(handle.navigation?.route).toEqual({ view: 'item', id: G1_SYNC, anchor: null })
    expect(row(titleOf(G1_SYNC))).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the ticket list of the parent when a group row is clicked', () => {
    renderPane()
    const group = row('4 tickets')
    const done = required(group.querySelector('[data-trivium-kind-count="done"]'))
    expect(done).toHaveTextContent('2')
    fireEvent.click(done)
    expect(spies.selectEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'group', parentId: G1_SEARCH })
    )
    expect(handle.navigation?.route).toEqual({ view: 'tickets', parentId: G1_SEARCH })
    expect(group).toHaveAttribute('aria-selected', 'true')
    expect(group).toHaveAttribute('aria-expanded', 'false')
  })

  it('brings a row opened from elsewhere into view', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderPane()
    act(() => handle.navigation?.openItem('ticket.sync-export'))
    const ticket = row(titleOf('ticket.sync-export'))
    expect(ticket).toHaveAttribute('aria-selected', 'true')
    expect(scroll.mock.contexts).toContain(ticket)
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })
})

describe('TriviumStructurePane filter', () => {
  const filterBox = (): HTMLElement =>
    screen.getByRole('searchbox', { name: 'Filter goals and tickets' })

  it('marks matches and shows their ancestors dimmed, over the saved expansion', () => {
    renderPane()
    fireEvent.change(filterBox(), { target: { value: 'TAGS INTACT' } })
    const items = screen.getAllByRole('treeitem')
    expect(items).toEqual([
      row(titleOf(G0)),
      row(titleOf(G1_SYNC)),
      row(titleOf(G2)),
      row('10 tickets'),
      row(titleOf('ticket.sync-export'))
    ])
    expect(items.map((item) => item.getAttribute('data-dimmed'))).toEqual([
      'true',
      'true',
      'true',
      'true',
      null
    ])
    expect(row('10 tickets')).toHaveAttribute('aria-expanded', 'true')
    const marks = document.querySelectorAll('mark')
    expect([...marks].map((mark) => mark.textContent)).toEqual(['tags intact'])
    expect(within(items[4]).getByText('tags intact').tagName).toBe('MARK')
    // The filter fixes expansion, so nothing offers to toggle.
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull()
  })

  it('says so when nothing matches and restores the outline when cleared', () => {
    renderPane()
    fireEvent.change(filterBox(), { target: { value: 'zz no such words' } })
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.getByText('No goals or tickets match.')).toBeInTheDocument()
    fireEvent.change(filterBox(), { target: { value: '' } })
    expect(screen.getAllByRole('treeitem')).toHaveLength(6)
  })

  it('says there are no goals yet, not that nothing matches, for an empty model', () => {
    const model = buildTriviumModel({
      status: makeSmallTriviumStatus([], []),
      tickets: [],
      progress: null
    })
    renderPane({ model })
    expect(screen.getByText('No goals yet.')).toBeInTheDocument()
    expect(screen.queryByText('No goals or tickets match.')).toBeNull()
    expect(screen.getByRole('button', { name: 'All tickets 0' })).toBeInTheDocument()
  })

  it('keeps a row selected while filtering in sight after the filter is cleared', () => {
    renderPane()
    fireEvent.change(filterBox(), { target: { value: 'tags intact' } })
    fireEvent.click(row(titleOf('ticket.sync-export')))
    fireEvent.change(filterBox(), { target: { value: '' } })
    expect(spies.toggle).toHaveBeenCalledWith(G2_GROUP, true)
    expect(row(titleOf('ticket.sync-export'))).toHaveAttribute('aria-selected', 'true')
    expect(row('10 tickets')).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('TriviumStructurePane ticket and change states', () => {
  it('shows the bell and "Needs approval" on tickets waiting for approval', () => {
    renderPane()
    openGroup('10 tickets')
    const ticket = row(titleOf('ticket.export-cutoff'))
    const icon = required(ticket.querySelector('[data-trivium-icon="ticket-status"]'))
    expect(icon).toHaveAttribute('data-value', 'approval')
    expect(icon.querySelector('.lucide-bell')).not.toBeNull()
    expect(within(ticket).getByText('Needs approval')).toHaveClass('text-trivium-decision')
    expect(ticket).toHaveAccessibleDescription('Needs approval')
    const done = row(titleOf('ticket.sync-baseline'))
    expect(within(done).queryByText('Needs approval')).toBeNull()
    expect(within(done).getByText(titleOf('ticket.sync-baseline'))).toHaveClass(
      'text-muted-foreground'
    )
  })

  it('shows "Blocked" on a blocked ticket and counts it on the closed group', () => {
    const input = makeTriviumModelInput()
    const model = buildTriviumModel({
      ...input,
      tickets: input.tickets.map((ticket) =>
        ticket.id === 'ticket.sync-refresh' ? { ...ticket, state: 'blocked' } : ticket
      )
    })
    renderPane({ model })
    const group = row('10 tickets')
    expect(
      [...group.querySelectorAll('[data-trivium-kind-count]')].map((count) => [
        count.getAttribute('data-trivium-kind-count'),
        count.textContent
      ])
    ).toEqual([
      ['blocked', '1'],
      ['approval', '2'],
      ['done', '7']
    ])
    openGroup('10 tickets')
    const ticket = row(titleOf('ticket.sync-refresh'))
    expect(within(ticket).getByText('Blocked')).toHaveClass('text-trivium-blocked')
    expect(ticket.querySelector('[data-trivium-icon="ticket-status"]')).toHaveAttribute(
      'data-value',
      'blocked'
    )
  })

  it('puts change dots on changed rows and counts changes on closed rows', () => {
    const changes = new Map<string, TriviumChange>([
      ['ticket.sync-export', { kind: 'new' }],
      [
        'ticket.sync-journal',
        { kind: 'changed', fields: [{ field: 'title', from: 'a', to: 'b' }] }
      ],
      [G1_SEARCH, { kind: 'changed', fields: [{ field: 'tier', from: 'g2', to: 'g1' }] }]
    ])
    renderPane({ changes })
    expect(
      within(row(titleOf(G1_SEARCH))).getByRole('img', { name: 'Changed: Tier G2 → G1' })
    ).toHaveAttribute('data-trivium-change', 'changed')
    const group = row('10 tickets')
    expect(within(group).getByText('1 new')).toHaveClass('text-trivium-new')
    expect(within(group).getByText('1 changed')).toHaveClass('text-trivium-new')

    fireEvent.click(within(row(titleOf(G1_SYNC))).getByRole('button', { name: 'Collapse' }))
    const goal = row(titleOf(G1_SYNC))
    expect(within(goal).getByRole('button', { name: '1 goal · 10 tickets' })).toBeInTheDocument()
    expect(within(goal).getByText('1 new')).toBeInTheDocument()
    fireEvent.click(within(goal).getByRole('button', { name: '1 goal · 10 tickets' }))
    openGroup('10 tickets')
    expect(within(row('10 tickets')).queryByText('1 new')).toBeNull()
    expect(
      within(row(titleOf('ticket.sync-export'))).getByRole('img', {
        name: 'New since your last visit'
      })
    ).toBeInTheDocument()
  })
})

describe('TriviumStructurePane views and dependencies', () => {
  it('shows the needs-you badge on Overview only when something needs the user', () => {
    renderPane()
    const overview = screen.getByRole('button', { name: 'Overview' })
    expect(overview).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('[data-trivium-needs-you]')).toBeNull()
    cleanup()
    renderPane({ needsYouCount: 4 })
    const badge = required(document.querySelector('[data-trivium-needs-you]'))
    expect(badge).toHaveTextContent('4')
    expect(badge).toHaveClass('bg-trivium-decision', 'text-trivium-on-color')
    expect(screen.getByRole('button', { name: 'Overview 4 need you' })).toBeInTheDocument()
  })

  it('opens All tickets and the Overview from the view rows', () => {
    renderPane()
    const all = screen.getByRole('button', { name: 'All tickets 14' })
    fireEvent.click(all)
    expect(spies.openTickets).toHaveBeenCalledWith(null)
    expect(all).toHaveAttribute('aria-current', 'page')
    fireEvent.click(row('4 tickets'))
    expect(all).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(spies.openOverview).toHaveBeenCalled()
    expect(handle.navigation?.route).toEqual({ view: 'overview' })
    expect(row('4 tickets')).toHaveAttribute('aria-selected', 'false')
  })

  it('explains the lane and draws arrows for the hovered or selected ticket, or all of them', () => {
    renderPane()
    const foot = required(document.querySelector('[data-trivium-dependency-foot]'))
    const arrows = (): Element[] => [
      ...document.querySelectorAll('[data-trivium-dependency-lane] g')
    ]
    expect(foot).toHaveTextContent('Select or hover a ticket to see its dependencies.')
    const toggle = screen.getByRole('button', { name: 'Show every dependency' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // Every edge runs between tickets of the closed G2 group.
    expect(foot).toHaveTextContent('No dependencies between the rows shown.')
    openGroup('10 tickets')
    expect(foot).toHaveTextContent('Arrows point from a ticket to what it depends on.')
    expect(arrows()).toHaveLength(12)
    expect(arrows().filter((arrow) => arrow.getAttribute('data-strong'))).toHaveLength(0)

    fireEvent.click(toggle)
    expect(arrows()).toHaveLength(0)
    fireEvent.mouseEnter(row(titleOf('ticket.sync-evaluation')))
    expect(arrows()).toHaveLength(3)
    expect(arrows().every((arrow) => arrow.getAttribute('data-strong') === 'true')).toBe(true)
    fireEvent.mouseLeave(screen.getByRole('tree'))
    expect(arrows()).toHaveLength(0)
    fireEvent.click(row(titleOf('ticket.sync-journal')))
    // The journal depends on the baseline and the conflict rules depend on it.
    expect(arrows()).toHaveLength(2)
    expect(foot).toHaveTextContent('Arrows point from a ticket to what it depends on.')
  })
})
