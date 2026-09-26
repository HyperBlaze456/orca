// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type {
  TriviumGoalRelation,
  TriviumGoalTier
} from '../../../../shared/trivium-workspace-status'
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

// Verifier edge cases for the structure pane (WO-2): ARIA, keys, filter, lane wiring, tooltip.

const titleOf = (id: string): string =>
  FIXTURE_GOALS.find((goal) => goal.id === id)?.title ??
  FIXTURE_TICKETS.find((ticket) => ticket.id === id)?.title ??
  id

const calls = {
  selectEntry: vi.fn<(entry: TriviumTreeEntry) => void>(),
  toggle: vi.fn<(key: string, open?: boolean) => void>()
}
const handle: { navigation: TriviumNavigation | null } = { navigation: null }

function Harness({
  model,
  changes
}: {
  model: TriviumModel
  changes: ReadonlyMap<string, TriviumChange>
}): React.JSX.Element {
  const entries = useMemo(() => buildTriviumTreeEntries(model), [model])
  const navigation = useTriviumNavigation({ storageKey: null, model, entries })
  handle.navigation = navigation
  const watched = useMemo<TriviumNavigation>(
    () => ({
      ...navigation,
      selectEntry: (entry) => {
        calls.selectEntry(entry)
        navigation.selectEntry(entry)
      },
      toggle: (key, open) => {
        calls.toggle(key, open)
        navigation.toggle(key, open)
      }
    }),
    [navigation]
  )
  return (
    <div style={{ height: 600 }}>
      <TriviumStructurePane
        model={model}
        entries={entries}
        navigation={watched}
        changes={changes}
        needsYouCount={0}
        ticketCount={model.ticketIds.length}
      />
    </div>
  )
}

function renderPane(model: TriviumModel = makeTriviumFixtureModel()): void {
  render(
    <TooltipProvider>
      <Harness model={model} changes={new Map()} />
    </TooltipProvider>
  )
}

type NodeRow = [string, TriviumGoalTier, string]
type EdgeRow = [string, string, TriviumGoalRelation?]
const smallModel = (nodes: NodeRow[], edges: EdgeRow[]): TriviumModel =>
  buildTriviumModel({ status: makeSmallTriviumStatus(nodes, edges), tickets: [], progress: null })

const row = (name: string): HTMLElement => screen.getByRole('treeitem', { name })
const rows = (name: string): HTMLElement[] => screen.getAllByRole('treeitem', { name })
const expand = (name: string): void => {
  fireEvent.click(within(row(name)).getByRole('button', { name: 'Expand' }))
}
const focused = (): Element | null => document.activeElement
const press = (key: string, init: Record<string, unknown> = {}): boolean => {
  const target = focused()
  if (!target) {
    throw new Error('nothing has focus')
  }
  return fireEvent.keyDown(target, { key, ...init })
}
const filterBox = (): HTMLElement =>
  screen.getByRole('searchbox', { name: 'Filter goals and tickets' })

/** Elements a Tab press can land on inside the tree. */
function tabStops(): Element[] {
  const tree = screen.getByRole('tree')
  return [...tree.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')].filter(
    (element) => element.getAttribute('tabindex') !== '-1' && !element.hasAttribute('disabled')
  )
}

beforeEach(() => {
  calls.selectEntry.mockClear()
  calls.toggle.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  handle.navigation = null
})

describe('structure pane: tab stop and ARIA edges', () => {
  it('keeps exactly one tab stop in the tree with every group open and while filtering', () => {
    renderPane()
    expand('4 tickets')
    expand('10 tickets')
    expect(screen.getAllByRole('treeitem')).toHaveLength(20)
    expect(tabStops()).toHaveLength(1)
    expect(tabStops()[0]).toHaveAttribute('role', 'treeitem')
    fireEvent.click(row(titleOf('ticket.sync-journal')))
    expect(tabStops()).toEqual([row(titleOf('ticket.sync-journal'))])
    fireEvent.change(filterBox(), { target: { value: 'sync' } })
    expect(tabStops()).toHaveLength(1)
  })

  it('puts aria-expanded only on rows that open: never on a leaf Goal or a ticket', () => {
    const model = smallModel(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['goal.c', 'g1', 'adopted'],
        ['a.1', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['goal.c', 'goal.root'],
        ['a.1', 'goal.a']
      ]
    )
    renderPane(model)
    expect(row('Title of goal.c')).not.toHaveAttribute('aria-expanded')
    expect(row('Title of goal.c')).toHaveAttribute('aria-level', '2')
    expect(row('1 ticket')).toHaveAttribute('aria-expanded', 'false')
    expand('1 ticket')
    expect(row('Title of a.1')).not.toHaveAttribute('aria-expanded')
    expect(row('Title of a.1')).toHaveAttribute('aria-selected', 'false')
    expect(row('Title of a.1')).toHaveAttribute('aria-level', '4')
  })

  it('draws a dashed ring and the status word for a Goal that is not adopted', () => {
    const model = smallModel(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'anticipated'],
        ['goal.b', 'g1', 'candidate'],
        ['goal.e', 'g2', 'proposed-later'],
        ['t.1', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['goal.b', 'goal.root'],
        ['goal.e', 'goal.a'],
        ['t.1', 'goal.b']
      ]
    )
    renderPane(model)
    const track = (name: string): Element | null =>
      row(name).querySelector('[data-trivium-icon="progress-ring"] circle')
    expect(track('Title of goal.root')).not.toHaveAttribute('stroke-dasharray')
    for (const name of ['Title of goal.a', 'Title of goal.b', 'Title of goal.e']) {
      expect(track(name)).toHaveAttribute('stroke-dasharray')
    }
    expect(within(row('Title of goal.a')).getByText('Anticipated')).not.toHaveClass(
      'text-trivium-decision'
    )
    expect(within(row('Title of goal.b')).getByText('Candidate')).toHaveClass(
      'text-trivium-decision'
    )
    expect(within(row('Title of goal.e')).getByText('Proposed-later')).toBeInTheDocument()
  })

  it('sets Goal title weights by tier, 13px two-line titles, and a blank tier on tickets', () => {
    renderPane()
    const title = (id: string): HTMLElement => within(row(titleOf(id))).getByText(titleOf(id))
    expect(title(G0)).toHaveClass('font-semibold', 'text-[13px]', 'line-clamp-2')
    for (const id of [G1_SEARCH, G1_SYNC, G2]) {
      expect(title(id)).toHaveClass('font-medium', 'text-[13px]', 'line-clamp-2')
      expect(title(id)).not.toHaveClass('font-semibold')
    }
    expand('10 tickets')
    const ticket = row(titleOf('ticket.sync-journal'))
    expect(within(ticket).getByText(titleOf('ticket.sync-journal'))).toHaveClass(
      'text-[13px]',
      'line-clamp-2'
    )
    expect(ticket.lastElementChild?.textContent).toBe('')
    // The frame svg only: the bell nests a lucide svg in viewBox units.
    const counts = [
      ...row('10 tickets').querySelectorAll('[data-trivium-kind-count] > svg[data-trivium-icon]')
    ]
    expect(counts.length).toBeGreaterThan(0)
    expect(counts.every((icon) => icon.getAttribute('width') === '12')).toBe(true)
  })
})

describe('structure pane: keyboard edges', () => {
  it('leaves arrows with a modifier to the app', () => {
    renderPane()
    row(titleOf(G0)).focus()
    expect(press('ArrowDown', { altKey: true })).toBe(true)
    expect(press('ArrowDown', { metaKey: true })).toBe(true)
    expect(press('End', { ctrlKey: true })).toBe(true)
    expect(focused()).toBe(row(titleOf(G0)))
    expect(calls.selectEntry).not.toHaveBeenCalled()
    // Without a modifier the tree owns the key.
    expect(press('ArrowDown')).toBe(false)
    expect(focused()).toBe(row(titleOf(G1_SEARCH)))
  })

  it('stops at both ends: ↑ on the first row and ↓ on the last do nothing', () => {
    renderPane()
    row(titleOf(G0)).focus()
    press('ArrowUp')
    expect(calls.selectEntry).not.toHaveBeenCalled()
    expect(focused()).toBe(row(titleOf(G0)))
    press('End')
    const last = row('10 tickets')
    expect(focused()).toBe(last)
    expect(calls.selectEntry).toHaveBeenCalledTimes(1)
    press('ArrowDown')
    expect(focused()).toBe(last)
    expect(calls.selectEntry).toHaveBeenCalledTimes(1)
  })

  it('while filtering, → steps into the first child and Enter selects instead of toggling', () => {
    renderPane()
    fireEvent.change(filterBox(), { target: { value: 'tags intact' } })
    row(titleOf(G0)).focus()
    press('ArrowRight')
    expect(focused()).toBe(row(titleOf(G1_SYNC)))
    press('Enter')
    press(' ')
    expect(calls.toggle).not.toHaveBeenCalled()
    expect(handle.navigation?.route).toEqual({ view: 'item', id: G1_SYNC, anchor: null })
    press('ArrowLeft')
    expect(focused()).toBe(row(titleOf(G0)))
    expect(row(titleOf(G1_SYNC))).toHaveAttribute('aria-expanded', 'true')
  })

  it('folds a group open with Enter without opening its ticket list', () => {
    renderPane()
    const group = row('10 tickets')
    group.focus()
    press('Enter')
    expect(group).toHaveAttribute('aria-expanded', 'true')
    expect(calls.selectEntry).not.toHaveBeenCalled()
    expect(handle.navigation?.route).toEqual({ view: 'overview' })
    expect(focused()).toBe(group)
    press(' ')
    expect(group).toHaveAttribute('aria-expanded', 'false')
  })

  it('moves focus to the toggled row when a pointer folds away the focused row', () => {
    renderPane()
    expand('10 tickets')
    const ticket = row(titleOf('ticket.sync-journal'))
    ticket.focus()
    const goal = row(titleOf(G2))
    fireEvent.click(within(goal).getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByRole('treeitem', { name: titleOf('ticket.sync-journal') })).toBeNull()
    expect(focused()).toBe(goal)
    expect(tabStops()).toEqual([goal])
  })
})

describe('structure pane: selection edges', () => {
  // root ─┬─ a ── [t.shared]
  //       └─ b ── [t.shared, b.1]      plus u.1 with no parent
  const shared = (): TriviumModel =>
    smallModel(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['goal.b', 'g1', 'adopted'],
        ['t.shared', 'g3', 'adopted'],
        ['b.1', 'g3', 'adopted'],
        ['u.1', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['goal.b', 'goal.root'],
        ['t.shared', 'goal.a'],
        ['t.shared', 'goal.b'],
        ['b.1', 'goal.b']
      ]
    )

  it('selects only the clicked place of a ticket that sits under two parents', () => {
    renderPane(shared())
    // a's group and the unparented group both read "1 ticket".
    fireEvent.click(within(rows('1 ticket')[0]).getByRole('button', { name: 'Expand' }))
    expand('2 tickets')
    const places = rows('Title of t.shared')
    expect(places).toHaveLength(2)
    fireEvent.click(within(places[1]).getByText('Title of t.shared'))
    expect(calls.selectEntry).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'goal.root>goal.b>goal.b#tickets>t.shared' })
    )
    expect(places.map((place) => place.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(handle.navigation?.route).toEqual({ view: 'item', id: 't.shared', anchor: null })
  })

  it('opens the whole ticket list from the unparented group row', () => {
    renderPane(shared())
    const unparented = screen.getAllByRole('treeitem').at(-1)
    if (!unparented) {
      throw new Error('no rows')
    }
    expect(unparented).toHaveAttribute('aria-level', '1')
    fireEvent.click(unparented)
    expect(calls.selectEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'group', parentId: null })
    )
    expect(handle.navigation?.route).toEqual({ view: 'tickets', parentId: null })
    expect(unparented).toHaveAttribute('aria-selected', 'true')
  })

  it('draws the selected row’s ancestry with the strong line, and nothing strong before', () => {
    renderPane()
    const strong = (element: Element): number =>
      element.querySelectorAll('.bg-trivium-line-strong').length
    expect(strong(screen.getByRole('tree'))).toBe(0)
    expand('10 tickets')
    fireEvent.click(row(titleOf('ticket.sync-journal')))
    for (const name of [
      titleOf('ticket.sync-journal'),
      '10 tickets',
      titleOf(G2),
      titleOf(G1_SYNC),
      // The path from the root to G1_SYNC runs past the G1_SEARCH rows.
      titleOf(G1_SEARCH),
      '4 tickets',
      titleOf(G0)
    ]) {
      expect(strong(row(name)), name).toBeGreaterThan(0)
    }
    expect(strong(row(titleOf('ticket.sync-export')))).toBe(0)
  })

  it('scrolls to an item opened from elsewhere under a folded Goal', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderPane()
    fireEvent.click(within(row(titleOf(G1_SYNC))).getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByRole('treeitem', { name: titleOf(G2) })).toBeNull()
    scroll.mockClear()
    act(() => handle.navigation?.openItem('ticket.sync-edit-history'))
    const ticket = row(titleOf('ticket.sync-edit-history'))
    expect(ticket).toHaveAttribute('aria-selected', 'true')
    expect(scroll.mock.contexts).toContain(ticket)
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })
})

describe('structure pane: filter edges', () => {
  it('shows a row matched by its id alone, undimmed and without a mark', () => {
    const model = makeTriviumFixtureModel()
    expect(model.title('ticket.sync-export').toLowerCase()).not.toContain('sync-export')
    renderPane(model)
    fireEvent.change(filterBox(), { target: { value: 'SYNC-EXPORT' } })
    const ticket = row(titleOf('ticket.sync-export'))
    expect(ticket).not.toHaveAttribute('data-dimmed')
    expect(ticket.querySelector('mark')).toBeNull()
    expect(row(titleOf(G2))).toHaveAttribute('data-dimmed', 'true')
  })

  it('dims the rows kept only as a path, and keeps the case of the marked text', () => {
    renderPane()
    fireEvent.change(filterBox(), { target: { value: 'tags intact' } })
    const titleIn = (name: string): HTMLElement => within(row(name)).getByText(name)
    expect(titleIn(titleOf(G0))).toHaveClass('opacity-50')
    expect(titleIn(titleOf(G2))).toHaveClass('opacity-50')
    expect(within(row('10 tickets')).getByText('10 tickets').closest('.opacity-50')).not.toBeNull()
    const match = row(titleOf('ticket.sync-export'))
    expect(match.querySelector('.opacity-50')).toBeNull()

    fireEvent.change(filterBox(), { target: { value: 'SYNC KEEPS' } })
    const marks = [...row(titleOf(G1_SYNC)).querySelectorAll('mark')]
    expect(marks.map((mark) => mark.textContent)).toEqual(['Sync keeps'])
  })

  it('overrides a folded Goal while filtering and restores the fold after', () => {
    renderPane()
    fireEvent.click(within(row(titleOf(G1_SYNC))).getByRole('button', { name: 'Collapse' }))
    fireEvent.change(filterBox(), { target: { value: 'tags intact' } })
    expect(row(titleOf('ticket.sync-export'))).toBeInTheDocument()
    expect(row(titleOf(G1_SYNC))).toHaveAttribute('aria-expanded', 'true')
    fireEvent.change(filterBox(), { target: { value: '' } })
    expect(row(titleOf(G1_SYNC))).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: titleOf(G2) })).toBeNull()
  })
})

describe('structure pane: lane wiring', () => {
  // root ─┬─ a ── [a.1]
  //       └─ b ── [b.1]      b.1 depends on a.1
  const crossGroups = (): TriviumModel =>
    smallModel(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['goal.b', 'g1', 'adopted'],
        ['a.1', 'g3', 'adopted'],
        ['b.1', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['goal.b', 'goal.root'],
        ['a.1', 'goal.a'],
        ['b.1', 'goal.b'],
        ['b.1', 'a.1', 'depends-on']
      ]
    )
  const scale = { rowHeight: 32 }
  const observers: (() => void)[] = []

  beforeEach(() => {
    scale.rowHeight = 32
    observers.length = 0
    // Rows sit one under another; everything else at 0.
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
      function (this: HTMLElement) {
        const parent = this.parentElement
        return this.getAttribute('role') === 'treeitem' && parent
          ? [...parent.children].indexOf(this) * scale.rowHeight
          : 0
      }
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback)
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
  })

  /** [dependent row y, dependency row y] of each arrow. */
  function arrowRows(): [number, number][] {
    return [...document.querySelectorAll('[data-trivium-dependency-lane] g')].map((group) => {
      const [line, head] = [...group.querySelectorAll('path')].map((path) => path.getAttribute('d'))
      const y1 = Number(/^M[\d.]+ ([\d.]+)H/.exec(line ?? '')?.[1])
      const y2 = Number(/^M[\d.]+ ([\d.]+)l/.exec(head ?? '')?.[1])
      return [y1, y2]
    })
  }

  it('attaches the selected ticket’s arrow to the closed group that holds its dependency', () => {
    renderPane(crossGroups())
    // 0 root, 1 a, 2 a#tickets (closed), 3 b, 4 b#tickets, 5 b.1
    fireEvent.click(within(rows('1 ticket')[1]).getByRole('button', { name: 'Expand' }))
    fireEvent.click(row('Title of b.1'))
    expect(arrowRows()).toEqual([[5 * 32 + 16, 2 * 32 + 16]])
    expect(
      document.querySelector('[data-trivium-dependency-lane] g')?.getAttribute('data-strong')
    ).toBe('true')
    // Folding b's group puts both ends on group rows: 4 and 2.
    fireEvent.click(within(rows('1 ticket')[1]).getByRole('button', { name: 'Collapse' }))
    expect(arrowRows()).toEqual([[4 * 32 + 16, 2 * 32 + 16]])
  })

  it('draws nothing for a hovered group row and the hovered ticket’s arrows strong', () => {
    renderPane(crossGroups())
    fireEvent.click(within(rows('1 ticket')[0]).getByRole('button', { name: 'Expand' }))
    fireEvent.click(within(rows('1 ticket')[1]).getByRole('button', { name: 'Expand' }))
    fireEvent.mouseEnter(rows('1 ticket')[1])
    expect(arrowRows()).toEqual([])
    fireEvent.mouseEnter(row('Title of a.1'))
    // 0 root, 1 a, 2 a#tickets, 3 a.1, 4 b, 5 b#tickets, 6 b.1
    expect(arrowRows()).toEqual([[6 * 32 + 16, 3 * 32 + 16]])
  })

  it('measures rows again when the tree resizes', () => {
    renderPane(crossGroups())
    fireEvent.click(within(rows('1 ticket')[1]).getByRole('button', { name: 'Expand' }))
    fireEvent.click(row('Title of b.1'))
    expect(arrowRows()).toEqual([[5 * 32 + 16, 2 * 32 + 16]])
    expect(observers.length).toBeGreaterThan(0)
    scale.rowHeight = 52
    act(() => {
      for (const callback of observers) {
        callback()
      }
    })
    expect(arrowRows()).toEqual([[5 * 52 + 16, 2 * 52 + 16]])
  })

  it('draws only the selected ticket’s arrows, all strong, on the real-shaped fixture', () => {
    const input = makeTriviumModelInput()
    renderPane(buildTriviumModel(input))
    expand('10 tickets')
    fireEvent.click(row(titleOf('ticket.sync-size-budget')))
    const drawn = [...document.querySelectorAll('[data-trivium-dependency-lane] g')]
    // Depends on edit-history and baseline; required by evaluation and trim-keeps-marker.
    expect(drawn).toHaveLength(4)
    expect(drawn.every((group) => group.getAttribute('data-strong') === 'true')).toBe(true)
    const lanes = arrowRows()
    expect(new Set(lanes.map(([from]) => from)).size).toBeGreaterThan(1)
  })
})

describe('structure pane: title tooltip', () => {
  it('shows the full title when the title is clamped, and nothing when it fits', async () => {
    renderPane()
    const clamped = within(row(titleOf(G2))).getByText(titleOf(G2))
    Object.defineProperty(clamped, 'scrollHeight', { configurable: true, value: 60 })
    Object.defineProperty(clamped, 'clientHeight', { configurable: true, value: 40 })
    fireEvent.focus(clamped)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent(titleOf(G2))
    fireEvent.blur(clamped)
    cleanup()

    renderPane()
    const fits = within(row(titleOf(G0))).getByText(titleOf(G0))
    fireEvent.focus(fits)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
