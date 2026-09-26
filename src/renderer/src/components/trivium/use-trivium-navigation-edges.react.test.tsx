// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import {
  buildTriviumTreeEntries,
  triviumDefaultExpandedKeys,
  type TriviumTreeEntry
} from './trivium-goal-tree'
import { makeSmallTriviumStatus, makeTriviumFixtureModel } from './trivium-model.fixture'
import { readTriviumTickets } from './trivium-ticket-records'
import { useTriviumNavigation, type TriviumNavigationOptions } from './use-trivium-navigation'

const KEY = 'orca-trivium-page-v1:repo:1:/srv/notes'

function rows(entries: readonly TriviumTreeEntry[]): TriviumTreeEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...(entry.kind === 'ticket' ? [] : rows(entry.children))
  ])
}

// ticket.both sits under two Goals (recorded parent goal.b); ticket.alone has no parent.
const shared: TriviumModel = buildTriviumModel({
  status: makeSmallTriviumStatus(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.a', 'g1', 'adopted'],
      ['goal.b', 'g1', 'adopted'],
      ['goal.hidden', 'g1', 'rejected'],
      ['ticket.both', 'g3', 'adopted'],
      ['ticket.alone', 'g3', 'adopted']
    ],
    [
      ['goal.a', 'goal.root'],
      ['goal.b', 'goal.root'],
      ['goal.hidden', 'goal.root'],
      ['ticket.both', 'goal.a'],
      ['ticket.both', 'goal.b']
    ]
  ),
  tickets: readTriviumTickets({ tickets: [{ id: 'ticket.both', parent: 'goal.b' }] }),
  progress: null
})
const sharedEntries = buildTriviumTreeEntries(shared)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useTriviumNavigation edges', () => {
  it('applies default expansion once entries arrive after loading', () => {
    const model = makeTriviumFixtureModel()
    const entries = buildTriviumTreeEntries(model)
    const initialProps: TriviumNavigationOptions = { storageKey: KEY, model: null, entries: [] }
    const { result, rerender } = renderHook((props) => useTriviumNavigation(props), {
      initialProps
    })
    expect(result.current.expanded.size).toBe(0)
    rerender({ storageKey: KEY, model, entries })
    expect([...result.current.expanded].sort()).toEqual(
      [...triviumDefaultExpandedKeys(entries)].sort()
    )
    // Nothing is stored until the user changes the expansion.
    expect(localStorage.getItem(`${KEY}:expanded`)).toBeNull()
  })

  it('keeps the clicked occurrence of a shared ticket selected', () => {
    const { result } = renderHook(() =>
      useTriviumNavigation({ storageKey: KEY, model: shared, entries: sharedEntries })
    )
    const underA = rows(sharedEntries).find(
      (entry) => entry.kind === 'ticket' && entry.key.includes('goal.a#tickets')
    )
    if (!underA) {
      throw new Error('shared ticket row missing')
    }
    act(() => result.current.selectEntry(underA))
    expect(result.current.selectedKey).toBe('goal.root>goal.a>goal.a#tickets>ticket.both')
    expect(result.current.route).toEqual({ view: 'item', id: 'ticket.both', anchor: null })
    act(() => result.current.openItem('ticket.both'))
    expect(result.current.selectedKey).toBe('goal.root>goal.b>goal.b#tickets>ticket.both')
    expect(result.current.expanded.has('goal.root>goal.b>goal.b#tickets')).toBe(true)
  })

  it('opens an unparented ticket inside the unparented group', () => {
    const { result } = renderHook(() =>
      useTriviumNavigation({ storageKey: KEY, model: shared, entries: sharedEntries })
    )
    act(() => result.current.openItem('ticket.alone', 'updates'))
    expect(result.current.route).toEqual({ view: 'item', id: 'ticket.alone', anchor: 'updates' })
    expect(result.current.selectedKey).toBe('unparented#tickets>ticket.alone')
    expect(result.current.expanded.has('unparented#tickets')).toBe(true)
  })

  it('keeps expansion in memory without a storage key and ignores garbage in storage', () => {
    const memory = renderHook(() =>
      useTriviumNavigation({ storageKey: null, model: shared, entries: sharedEntries })
    )
    act(() => memory.result.current.toggle('goal.root', false))
    expect(memory.result.current.expanded.has('goal.root')).toBe(false)
    expect(localStorage.length).toBe(0)
    localStorage.setItem(`${KEY}:expanded`, '{"goal.root":true}')
    const garbage = renderHook(() =>
      useTriviumNavigation({ storageKey: KEY, model: shared, entries: sharedEntries })
    )
    expect([...garbage.result.current.expanded].sort()).toEqual(
      [...triviumDefaultExpandedKeys(sharedEntries)].sort()
    )
    localStorage.setItem(`${KEY}:expanded`, 'not json')
    const unreadable = renderHook(() =>
      useTriviumNavigation({ storageKey: KEY, model: shared, entries: sharedEntries })
    )
    expect(unreadable.result.current.expanded.size).toBe(
      triviumDefaultExpandedKeys(sharedEntries).size
    )
  })

  it('restores a stored expansion under StrictMode and toggles idempotently', () => {
    localStorage.setItem(`${KEY}:expanded`, JSON.stringify(['goal.root', 'unparented#tickets', 7]))
    const { result } = renderHook(
      () => useTriviumNavigation({ storageKey: KEY, model: shared, entries: sharedEntries }),
      { wrapper: StrictMode }
    )
    expect([...result.current.expanded].sort()).toEqual(['goal.root', 'unparented#tickets'])
    act(() => result.current.toggle('goal.root', true))
    expect([...result.current.expanded].sort()).toEqual(['goal.root', 'unparented#tickets'])
    act(() => result.current.toggle('goal.root'))
    act(() => result.current.toggle('goal.root'))
    expect(result.current.expanded.has('goal.root')).toBe(true)
    expect(JSON.parse(localStorage.getItem(`${KEY}:expanded`) ?? '[]').sort()).toEqual([
      'goal.root',
      'unparented#tickets'
    ])
  })
})
