// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTriviumSnapshot, snapshotTriviumModel } from './trivium-change-markers'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { makeTriviumFixtureModel, makeTriviumModelInput } from './trivium-model.fixture'
import { useTriviumChangeMarkers } from './use-trivium-change-markers'

const KEY = 'orca-trivium-page-v1:repo:1:/srv/notes'
const OTHER_KEY = 'orca-trivium-page-v1:repo:2:/srv/other'
const model = makeTriviumFixtureModel()

/** The model as the user last saw it: one ticket not yet there, one renamed, one since removed. */
function lastVisit(): TriviumModel {
  const input = makeTriviumModelInput()
  const nodes = input.status.goals.nodes.filter((node) => node.id !== 'ticket.search-overlap-check')
  const renamed = nodes.find((node) => node.id === 'ticket.sync-export')
  if (renamed) {
    renamed.title = 'Older title'
  }
  nodes.push({
    id: 'ticket.dropped',
    tier: 'g3',
    title: 'Dropped',
    statement: '',
    status: 'adopted'
  })
  input.status.goals.nodes = nodes
  return buildTriviumModel(input)
}

function storeVisit(key: string, visited: TriviumModel): void {
  localStorage.setItem(`${key}:changes`, JSON.stringify(snapshotTriviumModel(visited, 1)))
}

function stored(key: string) {
  return readTriviumSnapshot(JSON.parse(localStorage.getItem(`${key}:changes`) ?? 'null'))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useTriviumChangeMarkers', () => {
  it('marks nothing on a first visit and stores what was seen on leaving', () => {
    const { result, unmount } = renderHook(() => useTriviumChangeMarkers(KEY, model))
    expect(result.current).toMatchObject({ newCount: 0, changedCount: 0, removed: [] })
    expect(stored(KEY)).toBeNull()
    unmount()
    expect(Object.keys(stored(KEY)?.items ?? {})).toHaveLength(18)
  })

  it('marks changes since the last visit and keeps them through a StrictMode remount', () => {
    storeVisit(KEY, lastVisit())
    const { result } = renderHook(() => useTriviumChangeMarkers(KEY, model), {
      wrapper: StrictMode
    })
    // The StrictMode remount already stored the current model as the next baseline.
    expect(stored(KEY)?.items).toEqual(snapshotTriviumModel(model, 0).items)
    expect(result.current.newCount).toBe(1)
    expect(result.current.changedCount).toBe(1)
    expect(result.current.changes.get('ticket.search-overlap-check')).toEqual({ kind: 'new' })
    expect(result.current.changes.get('ticket.sync-export')).toMatchObject({
      kind: 'changed',
      fields: [{ field: 'title', from: 'Older title' }]
    })
    expect(result.current.removed).toEqual([{ id: 'ticket.dropped', title: 'Dropped' }])
  })

  it('clears every marker on "Mark as seen" and stores the new baseline', () => {
    storeVisit(KEY, lastVisit())
    const { result } = renderHook(() => useTriviumChangeMarkers(KEY, model))
    act(() => result.current.markSeen())
    expect(result.current).toMatchObject({ newCount: 0, changedCount: 0, removed: [] })
    expect(stored(KEY)?.items).toEqual(snapshotTriviumModel(model, 0).items)
  })

  it('switches baselines with the workspace and waits for a model', () => {
    storeVisit(KEY, lastVisit())
    storeVisit(OTHER_KEY, model)
    const initialProps: { storageKey: string; current: TriviumModel | null } = {
      storageKey: KEY,
      current: null
    }
    const { result, rerender } = renderHook(
      ({ storageKey, current }) => useTriviumChangeMarkers(storageKey, current),
      { initialProps }
    )
    expect(result.current.changes.size).toBe(0)
    rerender({ storageKey: KEY, current: model })
    expect(result.current.newCount).toBe(1)
    rerender({ storageKey: OTHER_KEY, current: model })
    expect(result.current.changes.size).toBe(0)
    // Leaving the first workspace stored the model the user saw there.
    expect(stored(KEY)?.items).toEqual(snapshotTriviumModel(model, 0).items)
  })

  it('stores the last model seen even if a reload dropped it before leaving', () => {
    storeVisit(KEY, lastVisit())
    const initialProps: { current: TriviumModel | null } = { current: model }
    const { rerender, unmount } = renderHook(
      ({ current }) => useTriviumChangeMarkers(KEY, current),
      { initialProps }
    )
    rerender({ current: null })
    unmount()
    expect(stored(KEY)?.items).toEqual(snapshotTriviumModel(model, 0).items)
  })

  it('degrades to no markers when storage is unavailable', () => {
    storeVisit(KEY, lastVisit())
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { result, unmount } = renderHook(() => useTriviumChangeMarkers(KEY, model))
    expect(result.current.changes.size).toBe(0)
    act(() => result.current.markSeen())
    expect(result.current.changes.size).toBe(0)
    expect(() => unmount()).not.toThrow()
  })
})
