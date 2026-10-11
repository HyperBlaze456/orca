// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TriviumWorkspaceState } from '../../../../shared/trivium-workspace-status'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import { TriviumHeader, type TriviumHeaderTerminal } from './TriviumHeader'

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

const LOCAL_TERMINAL: TriviumHeaderTerminal = {
  open: false,
  availability: { available: true },
  onToggle: () => {}
}

function renderHeader(
  state: TriviumWorkspaceState | null,
  since: number | null | undefined,
  onRefresh = vi.fn(),
  terminal: TriviumHeaderTerminal = LOCAL_TERMINAL
): HTMLElement {
  renderWithTooltips(
    <TriviumHeader
      state={state}
      stale={since === undefined ? null : { since }}
      frame={null}
      onRefresh={onRefresh}
      terminal={terminal}
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

  it('toggles the terminal next to Refresh and says what the next click does', async () => {
    const onToggle = vi.fn()
    const header = renderHeader('active', undefined, vi.fn(), { ...LOCAL_TERMINAL, onToggle })
    const toggle = within(header).getByRole('button', { name: 'Terminal' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toBeEnabled()
    expect(toggle.nextElementSibling).toBe(within(header).getByRole('button', { name: 'Refresh' }))
    fireEvent.focus(toggle)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Terminal')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('offers to hide an open terminal', async () => {
    const header = renderHeader('active', undefined, vi.fn(), { ...LOCAL_TERMINAL, open: true })
    const toggle = within(header).getByRole('button', { name: 'Terminal' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.focus(toggle)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Hide terminal')
  })

  it('disables the terminal away from this computer and says why', async () => {
    const onToggle = vi.fn()
    const header = renderHeader('active', undefined, vi.fn(), {
      open: false,
      availability: { available: false, reason: 'not-local' },
      onToggle
    })
    const toggle = within(header).getByRole('button', { name: 'Terminal' })
    expect(toggle).toBeDisabled()
    fireEvent.click(toggle)
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.focus(requireElement(toggle.parentElement))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'The terminal is available for local workspaces only.'
    )
  })
})
