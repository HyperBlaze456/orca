// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTriviumTreeEntries,
  triviumDefaultExpandedKeys,
  type TriviumTicketGroupEntry,
  type TriviumTreeEntry
} from './trivium-goal-tree'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeTriviumFixtureModel } from './trivium-model.fixture'
import { useTriviumNavigation } from './use-trivium-navigation'

const model = makeTriviumFixtureModel()
const entries = buildTriviumTreeEntries(model)
const defaults = [...triviumDefaultExpandedKeys(entries)]
const KEY = 'orca-trivium-page-v1:repo:1:/srv/notes'
const SEARCH_GROUP = `${G0}>${G1_SEARCH}>${G1_SEARCH}#tickets`

function find(list: readonly TriviumTreeEntry[], key: string): TriviumTreeEntry | null {
  for (const entry of list) {
    if (entry.key === key) {
      return entry
    }
    const inner = entry.kind === 'ticket' ? null : find(entry.children, key)
    if (inner) {
      return inner
    }
  }
  return null
}

function render(storageKey: string | null = KEY) {
  return renderHook((props) => useTriviumNavigation(props), {
    initialProps: { storageKey, model, entries }
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useTriviumNavigation', () => {
  it('starts on the Overview with Goals open and ticket groups closed', () => {
    const { result } = render()
    expect(result.current.route).toEqual({ view: 'overview' })
    expect(result.current.selectedKey).toBeNull()
    expect([...result.current.expanded]).toEqual(defaults)
    expect(result.current.expanded.has(SEARCH_GROUP)).toBe(false)
  })

  it('opens an item at its canonical row and expands the rows above it', () => {
    const { result } = render()
    act(() => result.current.openItem('ticket.sync-export'))
    const group = `${G0}>${G1_SYNC}>${G2}>${G2}#tickets`
    expect(result.current.route).toEqual({ view: 'item', id: 'ticket.sync-export', anchor: null })
    expect(result.current.selectedKey).toBe(`${group}>ticket.sync-export`)
    expect(result.current.expanded.has(group)).toBe(true)
    expect(JSON.parse(localStorage.getItem(`${KEY}:expanded`) ?? '[]')).toContain(group)
    act(() => result.current.openItem(G2, 'updates'))
    expect(result.current.route).toEqual({ view: 'item', id: G2, anchor: 'updates' })
    expect(result.current.selectedKey).toBe(`${G0}>${G1_SYNC}>${G2}`)
  })

  it('routes a ticket group row to the ticket list of its parent', () => {
    const { result } = render()
    const group = find(entries, SEARCH_GROUP)
    if (!group) {
      throw new Error('fixture group missing')
    }
    act(() => result.current.selectEntry(group))
    expect(result.current.route).toEqual({ view: 'tickets', parentId: G1_SEARCH })
    expect(result.current.selectedKey).toBe(SEARCH_GROUP)
    const unparented: TriviumTicketGroupEntry = {
      kind: 'group',
      id: 'unparented#tickets',
      key: 'unparented#tickets',
      parentId: null,
      ticketIds: [],
      children: []
    }
    act(() => result.current.selectEntry(unparented))
    expect(result.current.route).toEqual({ view: 'tickets', parentId: null })
    const goal = find(entries, `${G0}>${G1_SYNC}`)
    act(() => goal && result.current.selectEntry(goal))
    expect(result.current.route).toEqual({ view: 'item', id: G1_SYNC, anchor: null })
    act(() => result.current.openTickets(G2))
    expect(result.current).toMatchObject({
      route: { view: 'tickets', parentId: G2 },
      selectedKey: null
    })
    act(() => result.current.openOverview())
    expect(result.current.route).toEqual({ view: 'overview' })
  })

  it('ignores ids the model does not know', () => {
    const { result } = render()
    act(() => result.current.openItem('ticket.unknown'))
    act(() => result.current.openTickets('goal.unknown'))
    expect(result.current.route).toEqual({ view: 'overview' })
    expect([...result.current.expanded]).toEqual(defaults)
  })

  it('persists the whole expanded set and restores it on the next visit', () => {
    const first = render()
    act(() => first.result.current.toggle(`${G0}>${G1_SYNC}`))
    act(() => first.result.current.toggle(SEARCH_GROUP, true))
    act(() => first.result.current.toggle(SEARCH_GROUP, true))
    expect(first.result.current.expanded.has(`${G0}>${G1_SYNC}`)).toBe(false)
    first.unmount()
    const second = render()
    expect([...second.result.current.expanded].sort()).toEqual(
      [...defaults.filter((key) => key !== `${G0}>${G1_SYNC}`), SEARCH_GROUP].sort()
    )
    second.unmount()
    expect([...render('orca-trivium-page-v1:repo:2:').result.current.expanded]).toEqual(defaults)
  })

  it('starts over when the workspace changes and works without storage', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { result, rerender } = render()
    act(() => result.current.openItem(G2))
    act(() => result.current.toggle(G0))
    expect(result.current.expanded.has(G0)).toBe(false)
    rerender({ storageKey: 'orca-trivium-page-v1:repo:2:', model, entries })
    expect(result.current.route).toEqual({ view: 'overview' })
    expect(result.current.selectedKey).toBeNull()
    expect([...result.current.expanded]).toEqual(defaults)
  })
})
