// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries, type TriviumTreeEntry } from './trivium-goal-tree'
import { G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeTriviumModelInput } from './trivium-model.fixture'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import {
  makeLoadState,
  renderWithTooltips,
  requireElement,
  requireTextArea
} from './trivium-reader-test-harness'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumReader } from './TriviumReader'
import { useTriviumNavigation } from './use-trivium-navigation'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

function Page({
  model,
  entries,
  loadState = makeLoadState()
}: {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  loadState?: TriviumReaderLoadState
}): React.JSX.Element {
  const navigation = useTriviumNavigation({ storageKey: null, model, entries })
  return (
    <TriviumReader
      model={model}
      entries={entries}
      navigation={navigation}
      changes={new Map()}
      loadState={loadState}
      workspaceId="wt"
      sessionKey="wt"
    />
  )
}

function page(): string | null {
  return document.querySelector('[data-trivium-page]')?.getAttribute('data-trivium-page') ?? null
}

function scroller(): HTMLElement {
  return requireElement(document.querySelector('[data-trivium-reader-scroll]'))
}

beforeEach(() => {
  send.mockReset().mockResolvedValue({ status: 'sent' })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useTriviumSessionState.setState({ sessions: {} })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TriviumReader routes', () => {
  it('moves overview → goal → list → ticket through navigation, composer only on items', () => {
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} />)
    expect(page()).toBe('overview')
    expect(document.querySelector('[data-trivium-composer]')).toBeNull()

    fireEvent.click(requireElement(document.querySelector(`[data-trivium-goal-row="${G2}"]`)))
    expect(page()).toBe('goal')
    expect(document.querySelector('[data-trivium-composer-context]')).toHaveTextContent(/^G2 goal/)

    fireEvent.click(screen.getByRole('button', { name: 'Open in list' }))
    expect(page()).toBe('tickets')
    expect(screen.getByRole('heading', { level: 2, name: 'Tickets' })).toBeInTheDocument()
    expect(document.querySelector('[data-trivium-composer]')).toBeNull()

    fireEvent.click(
      requireElement(document.querySelector('[data-trivium-ticket-row="ticket.sync-export"]'))
    )
    expect(page()).toBe('ticket')
    expect(document.querySelector('[data-trivium-composer-context]')).toHaveTextContent(/^Ticket/)

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Goal path' })).getAllByRole('button')[2]
    )
    expect(page()).toBe('goal')
    // Back on the goal, the ticket opened last stays highlighted in its list.
    expect(
      document.querySelector('[data-trivium-ticket-row="ticket.sync-export"]')
    ).toHaveAttribute('data-current', 'true')
  })

  it('starts every route at the top and lands an updates link on the milestones', () => {
    const scrolled = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} />)
    scroller().scrollTop = 240
    expect(scroller().scrollTop).toBe(240)
    fireEvent.click(requireElement(document.querySelector(`[data-trivium-goal-row="${G1_SYNC}"]`)))
    expect(page()).toBe('goal')
    expect(scroller().scrollTop).toBe(0)
    expect(scrolled).not.toHaveBeenCalled()

    scroller().scrollTop = 120
    const row = document.querySelector(
      '[data-trivium-sub-goal-milestone="campaign.sync-contradictions"] button'
    )
    fireEvent.click(requireElement(row))
    expect(document.querySelector('[data-trivium-item]')).toHaveAttribute('data-trivium-item', G2)
    expect(scrolled).toHaveBeenCalledOnce()
    const target = requireElement(scrolled.mock.contexts[0])
    expect(target).toHaveAttribute('data-trivium-anchor', 'updates')
    expect(target).toHaveAttribute('data-trivium-section', 'latest-milestone')
  })

  it('shows a way back when the open item leaves the model', () => {
    const input = makeTriviumModelInput('head')
    const model = buildTriviumModel(input)
    const entries = buildTriviumTreeEntries(model)
    const view = renderWithTooltips(<Page model={model} entries={entries} />)
    fireEvent.click(requireElement(document.querySelector(`[data-trivium-goal-row="${G2}"]`)))
    expect(page()).toBe('goal')

    const retired = buildTriviumModel({
      ...input,
      status: {
        ...input.status,
        goals: {
          ...input.status.goals,
          nodes: input.status.goals.nodes.map((node) =>
            node.id === G2 ? { ...node, status: 'retired' } : node
          )
        }
      }
    })
    view.rerender(<Page model={retired} entries={buildTriviumTreeEntries(retired)} />)
    expect(page()).toBe('missing')
    expect(screen.getByText('This item is no longer in the Goal model')).toBeInTheDocument()
    expect(document.querySelector('[data-trivium-composer]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))
    expect(page()).toBe('overview')
  })

  it('prefills the composer from the approval callout without sending', () => {
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} />)
    const candidate = requireElement(document.querySelector('[data-trivium-needs-you="candidate"]'))
    fireEvent.click(within(candidate).getByRole('button', { name: 'Review' }))
    expect(page()).toBe('ticket')
    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent to approve' }))
    const input = requireTextArea(screen.getByRole('textbox', { name: 'Message to the agent' }))
    expect(input.value).toContain('I approve the proposed ticket')
    expect(input.value).toContain('trivium model ticket approve ticket.export-cutoff')
    expect(document.activeElement).toBe(input)
    expect(send).not.toHaveBeenCalled()
    expect(document.body).not.toHaveTextContent(/\bApproved\b/)
  })

  it('passes the load state and its retry down to the pages', () => {
    const loadState = makeLoadState('error', 'loading')
    const { model, entries } = makeReaderFixture()
    renderWithTooltips(<Page model={model} entries={entries} loadState={loadState} />)
    expect(screen.getByRole('status', { name: 'Loading progress details…' })).toBeInTheDocument()
    fireEvent.click(requireElement(document.querySelector(`[data-trivium-goal-row="${G2}"]`)))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
  })
})
