// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TriviumChange } from './trivium-change-markers'
import { fixtureApproveCommand, fixtureHex, G2 } from './trivium-model-tables.fixture'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement,
  stubClipboard
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TriviumTicketPage } from './TriviumTicketPage'

afterEach(cleanup)
let clipboard: ReturnType<typeof stubClipboard>
beforeEach(() => {
  clipboard = stubClipboard()
})

function renderTicket(
  id: string,
  fixture: ReaderFixture = makeReaderFixture(),
  loadState: TriviumReaderLoadState = makeLoadState(),
  changes: ReadonlyMap<string, TriviumChange> = new Map()
) {
  const navigation = makeReaderNavigation({ view: 'item', id, anchor: null })
  const onAskAgent = vi.fn<(draft: string) => void>()
  const view = renderWithTooltips(
    <TriviumTicketPage
      model={fixture.model}
      id={id}
      entries={fixture.entries}
      navigation={navigation}
      changes={changes}
      loadState={loadState}
      onAskAgent={onAskAgent}
    />
  )
  return { ...view, navigation, onAskAgent, fixture }
}

function property(container: HTMLElement, name: string): HTMLElement {
  return requireElement(container.querySelector(`[data-trivium-property="${name}"] dd`))
}

describe('ticket pager', () => {
  it('pages through the siblings under the same parent in outline order', () => {
    const { container, navigation, fixture } = renderTicket('ticket.export-cutoff')
    expect(fixture.model.directTickets(G2).indexOf('ticket.export-cutoff')).toBe(5)
    const pager = requireElement(container.querySelector('[data-trivium-pager]'))
    expect(pager).toHaveTextContent('6 / 10')
    fireEvent.click(within(pager).getByRole('button', { name: 'Previous ticket' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith('ticket.sync-export')
    fireEvent.click(within(pager).getByRole('button', { name: 'Next ticket' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith('ticket.sync-size-budget')
  })

  it('disables the ends of the range', () => {
    const first = renderTicket('ticket.sync-baseline')
    const firstPager = requireElement(first.container.querySelector('[data-trivium-pager]'))
    expect(firstPager).toHaveTextContent('1 / 10')
    expect(within(firstPager).getByRole('button', { name: 'Previous ticket' })).toBeDisabled()
    expect(within(firstPager).getByRole('button', { name: 'Next ticket' })).toBeEnabled()
    cleanup()
    const last = renderTicket('ticket.sync-evaluation')
    const lastPager = requireElement(last.container.querySelector('[data-trivium-pager]'))
    expect(lastPager).toHaveTextContent('10 / 10')
    expect(within(lastPager).getByRole('button', { name: 'Next ticket' })).toBeDisabled()
  })
})

describe.each(['head', 'installed'] as const)('Ticket page on the %s fixture', (binary) => {
  it('fills the properties rail from the model', () => {
    const { container, navigation } = renderTicket(
      'ticket.export-cutoff',
      makeReaderFixture(binary)
    )
    expect(property(container, 'status')).toHaveTextContent('Done')
    expect(property(container, 'approval')).toHaveTextContent('Needs approval')
    expect(property(container, 'goal')).toHaveTextContent(/^첫 동기화 단계/)
    expect(property(container, 'merged')).toHaveTextContent(
      fixtureHex('ticket.export-cutoff').slice(0, 7)
    )
    expect(property(container, 'depends-on')).toHaveTextContent('1 ticket')
    expect(property(container, 'required-by')).toHaveTextContent('None')
    expect(container.querySelector('[data-trivium-property="change"]')).toBeNull()
    expect(property(container, 'id')).toHaveTextContent('export-cutoff')
    expect(property(container, 'files')).toHaveTextContent('10')
    fireEvent.click(within(property(container, 'goal')).getByRole('button'))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G2)
  })

  it('asks for approval only on a proposed ticket and never approves by itself', async () => {
    const { container, onAskAgent } = renderTicket(
      'ticket.export-cutoff',
      makeReaderFixture(binary)
    )
    const callout = requireElement(container.querySelector('[data-trivium-approval]'))
    expect(callout).toHaveTextContent('Waiting for your approval')
    expect(callout).toHaveTextContent(
      'Approving adopts this proposed ticket under “첫 동기화 단계: 오프라인에서 고친 노트가 다시 연결될 때 순서대로 합쳐진다 (first slice)”. Until then it is not part of the Goal model.'
    )
    expect(callout).toHaveTextContent('Why it was proposed.')
    const command = fixtureApproveCommand('ticket.export-cutoff')
    expect(callout.querySelector('[data-trivium-approve-command]')).toHaveTextContent(command)

    fireEvent.click(within(callout).getByRole('button', { name: 'Ask the agent to approve' }))
    expect(onAskAgent).toHaveBeenCalledOnce()
    const draft = onAskAgent.mock.calls[0][0]
    expect(draft).toContain('I approve the proposed ticket')
    expect(draft).toContain('ticket.export-cutoff')
    expect(draft).toContain(command)

    fireEvent.click(within(callout).getByRole('button', { name: 'Copy command' }))
    await screen.findByText('Copied')
    expect(clipboard).toHaveBeenCalledWith(command)
    expect(container).not.toHaveTextContent(/\bApproved\b/)
  })

  it('shows no callout on an adopted ticket', () => {
    const { container } = renderTicket('ticket.sync-baseline', makeReaderFixture(binary))
    expect(container.querySelector('[data-trivium-approval]')).toBeNull()
    expect(property(container, 'approval')).toHaveTextContent('Adopted')
    expect(property(container, 'required-by')).toHaveTextContent('3 tickets')
  })

  it('shows what delivered it, its dependencies and the files it touches', () => {
    const { container, navigation } = renderTicket(
      'ticket.export-cutoff',
      makeReaderFixture(binary)
    )
    const delivered = screen.getByRole('region', { name: 'Delivered by' })
    const card = requireElement(delivered.querySelector('[data-trivium-feature]'))
    expect(card).toHaveAttribute('data-trivium-feature', 'feature.export-cutoff')
    expect(card.querySelector('[data-trivium-commit]')).not.toBeNull()
    const outcome = within(card).getByRole('button', { expanded: false })
    expect(outcome.firstElementChild).toHaveClass('line-clamp-3')
    fireEvent.click(outcome)
    expect(outcome.firstElementChild).not.toHaveClass('line-clamp-3')

    const dependsOn = screen.getByRole('region', { name: 'Depends on' })
    const row = requireElement(dependsOn.querySelector('[data-trivium-ticket-row]'))
    expect(row).toHaveAttribute('data-trivium-ticket-row', 'ticket.sync-export')
    expect(dependsOn.querySelector('[data-trivium-group] > button')).toBeNull()
    fireEvent.click(row)
    expect(navigation.openItem).toHaveBeenLastCalledWith('ticket.sync-export')
    expect(screen.queryByRole('region', { name: 'Required by' })).toBeNull()

    expect(container).not.toHaveTextContent('src/notes/export-cutoff/part-0.ts')
    fireEvent.click(screen.getByRole('button', { name: 'Files this ticket touches · 10' }))
    expect(container.querySelectorAll('[data-trivium-section="files"] li')).toHaveLength(10)
  })
})

describe('Ticket page markers and loading', () => {
  it('names a change in the rail', () => {
    const changes = new Map<string, TriviumChange>([['ticket.export-cutoff', { kind: 'new' }]])
    const { container } = renderTicket(
      'ticket.export-cutoff',
      makeReaderFixture(),
      makeLoadState(),
      changes
    )
    expect(property(container, 'change')).toHaveTextContent('New since your last visit')
  })

  it('keeps status data on screen while ticket records and progress load', () => {
    const { container } = renderTicket(
      'ticket.export-cutoff',
      makeReaderFixture(),
      makeLoadState('loading', 'loading')
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'A cancelled export deletes its half-written file and says where it stopped'
    )
    expect(container.querySelector('[data-trivium-approval]')).not.toBeNull()
    expect(property(container, 'status').querySelector('[data-trivium-skeleton]')).not.toBeNull()
    expect(property(container, 'approval')).toHaveTextContent('Needs approval')
    expect(screen.getByRole('status', { name: 'Loading progress details…' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading tickets…' })).toBeInTheDocument()
  })

  it('reports a failed ticket load with Retry', () => {
    const loadState = makeLoadState('error', 'ready')
    const { container } = renderTicket('ticket.export-cutoff', makeReaderFixture(), loadState)
    const failure = requireElement(container.querySelector('[data-trivium-pending="error"]'))
    expect(failure).toHaveTextContent("Couldn't load tickets.")
    fireEvent.click(within(failure).getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
    expect(property(container, 'status')).toHaveTextContent('—')
  })
})
