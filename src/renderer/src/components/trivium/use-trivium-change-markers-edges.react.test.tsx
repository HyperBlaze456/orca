// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotTriviumModel } from './trivium-change-markers'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { makeTriviumFixtureModel, makeTriviumModelInput } from './trivium-model.fixture'
import { useTriviumChangeMarkers } from './use-trivium-change-markers'

const KEY = 'orca-trivium-page-v1:repo:1:/srv/notes'
const model = makeTriviumFixtureModel()

/** The fixture model plus one new ticket, as the next refresh would bring it. */
function withNewTicket(): TriviumModel {
  const input = makeTriviumModelInput()
  input.status.goals.nodes.push({
    id: 'ticket.arrived',
    tier: 'g3',
    title: 'Arrived while the page was open',
    statement: '',
    status: 'adopted'
  })
  return buildTriviumModel(input)
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useTriviumChangeMarkers edges', () => {
  it('compares a refresh during the visit against the baseline read at opening', () => {
    localStorage.setItem(`${KEY}:changes`, JSON.stringify(snapshotTriviumModel(model, 1)))
    const initialProps: { current: TriviumModel } = { current: model }
    const { result, rerender, unmount } = renderHook(
      ({ current }) => useTriviumChangeMarkers(KEY, current),
      { initialProps }
    )
    expect(result.current.changes.size).toBe(0)
    rerender({ current: withNewTicket() })
    expect(result.current.newCount).toBe(1)
    expect(result.current.changes.get('ticket.arrived')).toEqual({ kind: 'new' })
    unmount()
    // Leaving stored what the user saw, so the next visit starts clean.
    const next = renderHook(() => useTriviumChangeMarkers(KEY, withNewTicket()))
    expect(next.result.current.changes.size).toBe(0)
  })

  it('marks nothing and stores nothing without a storage key', () => {
    const { result, unmount } = renderHook(() => useTriviumChangeMarkers(null, model))
    expect(result.current).toMatchObject({ newCount: 0, changedCount: 0, removed: [] })
    act(() => result.current.markSeen())
    unmount()
    expect(localStorage.length).toBe(0)
  })

  it('treats an unreadable stored baseline as a first visit', () => {
    localStorage.setItem(`${KEY}:changes`, '{"items":')
    const { result } = renderHook(() => useTriviumChangeMarkers(KEY, model))
    expect(result.current.changes.size).toBe(0)
    expect(result.current.removed).toEqual([])
  })

  it('keeps markers after "Mark as seen" is followed by a refresh with another new node', () => {
    localStorage.setItem(`${KEY}:changes`, JSON.stringify(snapshotTriviumModel(model, 1)))
    const initialProps: { current: TriviumModel } = { current: model }
    const { result, rerender } = renderHook(
      ({ current }) => useTriviumChangeMarkers(KEY, current),
      { initialProps }
    )
    act(() => result.current.markSeen())
    rerender({ current: withNewTicket() })
    expect(result.current.changes.get('ticket.arrived')).toEqual({ kind: 'new' })
    expect(result.current.newCount).toBe(1)
  })
})
