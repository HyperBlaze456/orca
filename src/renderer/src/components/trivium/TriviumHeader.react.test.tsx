// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TriviumWorkspaceState } from '../../../../shared/trivium-workspace-status'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import { TriviumHeader } from './TriviumHeader'

const PHRASES: [TriviumWorkspaceState, string][] = [
  ['review', 'Milestone ready for review'],
  ['runnable', 'Ready to run'],
  ['active', 'Campaign running'],
  ['paused', 'Paused, needs your decision'],
  ['escalated', 'Needs your decision'],
  ['goal-draft', 'Goal draft to review'],
  ['no-adopted-goal', 'No Goal adopted'],
  ['no-harness', 'Not set up in this workspace']
]

function renderHeader(
  state: TriviumWorkspaceState | null,
  since: number | null | undefined,
  onRefresh = vi.fn()
): HTMLElement {
  renderWithTooltips(
    <TriviumHeader
      state={state}
      stale={since === undefined ? null : { since }}
      frame={null}
      onRefresh={onRefresh}
    />
  )
  return requireElement(document.querySelector('[data-trivium-header]'))
}

afterEach(cleanup)

describe('TriviumHeader', () => {
  it.each(PHRASES)('names the %s state in words', (state, phrase) => {
    const header = renderHeader(state, undefined)
    const label = requireElement(header.querySelector('[data-trivium-state]'))
    expect(label).toHaveAttribute('data-trivium-state', state)
    expect(label).toHaveTextContent(phrase)
    // Only a milestone waiting for review carries the orange diamond.
    expect(label.querySelector('[data-trivium-icon="milestone"]') !== null).toBe(state === 'review')
  })

  it('shows only the title and Refresh before a state is known', () => {
    const onRefresh = vi.fn()
    const header = renderHeader(null, undefined, onRefresh)
    expect(header.querySelector('[data-trivium-state], [data-trivium-stale]')).toBeNull()
    fireEvent.click(within(header).getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('says data is stale with its arrival time, and Retry refreshes', () => {
    const onRefresh = vi.fn()
    const since = new Date(2026, 8, 26, 14, 2).getTime()
    const header = renderHeader('active', since, onRefresh)
    const notice = requireElement(header.querySelector('[data-trivium-stale]'))
    expect(within(notice).getByRole('status')).toHaveTextContent(
      "Can't reach Trivium. Showing data from 14:02."
    )
    fireEvent.click(within(notice).getByRole('button', { name: 'Retry' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('still says the data is stale when its arrival time is unknown', () => {
    const header = renderHeader('active', null)
    expect(header).toHaveTextContent("Can't reach Trivium. Showing the last data received.")
  })
})
