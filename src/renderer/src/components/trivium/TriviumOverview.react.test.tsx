// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries } from './trivium-goal-tree'
import { FIXTURE_REVIEW_CAMPAIGN, G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeSmallTriviumStatus, makeTriviumModelInput } from './trivium-model.fixture'
import { triviumWorkText } from './trivium-reader-text'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement,
  sectionNames
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TriviumOverview } from './TriviumOverview'
import type { TriviumReaderLoadState } from './trivium-reader-load'

afterEach(cleanup)

function renderOverview(
  fixture: ReaderFixture,
  loadState: TriviumReaderLoadState = makeLoadState(),
  changes = new Map()
) {
  const navigation = makeReaderNavigation()
  const view = renderWithTooltips(
    <TriviumOverview
      model={fixture.model}
      entries={fixture.entries}
      navigation={navigation}
      changes={changes}
      loadState={loadState}
    />
  )
  return { ...view, navigation }
}

describe.each(['head', 'installed'] as const)('Overview on the %s fixture', (binary) => {
  it('puts what needs the user first and keeps the A8 order', () => {
    const { container } = renderOverview(makeReaderFixture(binary))
    expect(sectionNames(container)).toEqual([
      'needs-you',
      'goals',
      'open-questions',
      'memory',
      'campaigns',
      'workspace-details'
    ])
    expect(
      screen.getByRole('heading', { level: 2, name: 'A milestone is ready for your review' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Campaign ticket-dogfood wrote a milestone summary with 3 unknowns and 1 promotion candidate'
      )
    ).toBeInTheDocument()
  })

  it('lists the milestone review and each proposed ticket with where they lead', () => {
    const { container, navigation } = renderOverview(makeReaderFixture(binary))
    const rows = [...container.querySelectorAll('[data-trivium-needs-you]')]
    expect(rows.map((row) => row.getAttribute('data-trivium-needs-you'))).toEqual([
      'milestone',
      'candidate',
      'candidate',
      'candidate'
    ])
    const milestone = requireElement(rows[0])
    expect(milestone).toHaveTextContent('Review the ticket-dogfood milestone')
    expect(within(milestone).getByText('2 contradictions')).toHaveClass('text-trivium-blocked')
    expect(milestone).toHaveTextContent('3 open questions · 1 promotion candidate')
    fireEvent.click(within(milestone).getByRole('button', { name: 'Read' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G1_SEARCH, 'updates')

    const candidate = requireElement(rows[1])
    expect(candidate).toHaveTextContent(
      'A cancelled export deletes its half-written file and says where it stopped'
    )
    expect(candidate.querySelector('[data-trivium-icon="ticket-status"]')).toHaveAttribute(
      'data-value',
      'approval'
    )
    expect(candidate).toHaveTextContent(/Proposed ticket · 첫 동기화 단계/)
    fireEvent.click(within(candidate).getByRole('button', { name: 'Review' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith('ticket.export-cutoff')
  })

  it('shows Goals in outline order with work and outcome kept apart', () => {
    const fixture = makeReaderFixture(binary)
    const { container, navigation } = renderOverview(fixture)
    const goals = within(screen.getByRole('region', { name: 'Goals' }))
    expect(
      goals.getByText('Work counts tickets done. Outcome needs assessed success criteria.')
    ).toBeInTheDocument()
    const rows = [...container.querySelectorAll('[data-trivium-goal-row]')]
    expect(rows.map((row) => row.getAttribute('data-trivium-goal-row'))).toEqual([
      G0,
      G1_SEARCH,
      G1_SYNC,
      G2
    ])
    for (const row of rows) {
      const id = row.getAttribute('data-trivium-goal-row') ?? ''
      expect(row.querySelector('[data-trivium-work]')).toHaveTextContent(
        triviumWorkText(fixture.model.work(id))
      )
      expect(row).toHaveTextContent('Not assessed')
    }
    expect(rows[0]).toHaveTextContent('13/14 tickets done')
    expect(rows[0]).toHaveTextContent('G0')
    fireEvent.click(rows[2])
    expect(navigation.openItem).toHaveBeenLastCalledWith(G1_SYNC)
  })

  it('shows three questions of each kind until asked for all, and expands one on click', () => {
    renderOverview(makeReaderFixture(binary))
    const questions = screen.getByRole('region', { name: 'Open questions' })
    expect(questions).toHaveTextContent('Contradictions8')
    expect(questions).toHaveTextContent('Unknowns11')
    const contradictions = questions.querySelector('[data-trivium-questions="contradictions"]')
    expect(contradictions?.querySelectorAll('li')).toHaveLength(3)
    fireEvent.click(
      within(requireElement(contradictions)).getByRole('button', { name: 'Show all 8' })
    )
    expect(contradictions?.querySelectorAll('li')).toHaveLength(8)
    const first = requireElement(contradictions?.querySelector('li button[aria-expanded]'))
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(first.firstElementChild).toHaveClass('line-clamp-2')
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(first.firstElementChild).not.toHaveClass('line-clamp-2')
  })

  it('summarizes memory, lists Campaigns newest first and folds workspace details', () => {
    const { container, navigation } = renderOverview(makeReaderFixture(binary))
    const memory = screen.getByRole('region', { name: 'Memory' })
    expect(memory).toHaveTextContent('Across 6 Campaigns: +620 added · 1,520 re-checked and kept')
    expect(within(memory).getByRole('img')).toHaveAccessibleName(
      'Current memory: 934 valid, 25 to recheck, 56 no longer hold, 1,929 replaced by newer'
    )
    expect(memory).not.toHaveTextContent('decision selected approach')
    fireEvent.click(within(memory).getByRole('button', { name: 'Examples of added memory' }))
    expect(memory.querySelectorAll('li button[aria-expanded]')).toHaveLength(3)

    const campaigns = [...container.querySelectorAll('[data-trivium-campaign]')]
    expect(campaigns.map((row) => row.getAttribute('data-trivium-campaign'))[0]).toBe(
      FIXTURE_REVIEW_CAMPAIGN
    )
    expect(campaigns).toHaveLength(6)
    expect(campaigns[0]).toHaveTextContent('Milestone written')
    expect(campaigns[0].querySelector('[data-trivium-icon="milestone"]')).toHaveAttribute(
      'data-value',
      'review'
    )
    fireEvent.click(within(requireElement(campaigns[0])).getByRole('button'))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G1_SEARCH)

    expect(screen.queryByText('/srv/notes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Workspace details' }))
    expect(screen.getByText('/srv/notes')).toBeInTheDocument()
    expect(screen.getByText('49 nodes · 14 promoted · 35 from milestones')).toBeInTheDocument()
  })
})

describe('Overview sections with nothing to show', () => {
  it('omits Needs you and the progress sections when there is nothing in them', () => {
    const input = makeTriviumModelInput('head')
    const status = makeSmallTriviumStatus([[G0, 'g0', 'adopted']], [])
    const model = buildTriviumModel({ ...input, status, progress: null })
    const { container } = renderOverview({ model, entries: buildTriviumTreeEntries(model) })
    expect(sectionNames(container)).toEqual(['goals', 'workspace-details'])
  })

  it('shows interviews and guidance instead of empty sections before a Goal is adopted', () => {
    const input = makeTriviumModelInput('head')
    const status = makeSmallTriviumStatus([], [])
    status.state = 'no-adopted-goal'
    status.state_reason = 'No adopted Goal yet; 2 Goal interview(s) in progress'
    const model = buildTriviumModel({ ...input, status, progress: null })
    const { container } = renderOverview({ model, entries: buildTriviumTreeEntries(model) })
    expect(sectionNames(container)).toEqual(['interviews', 'guidance', 'workspace-details'])
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'No Goal has been adopted yet'
    )
    expect(screen.getByText(/2 Goal interviews in progress/)).toBeInTheDocument()
    const interviews = screen.getByRole('region', { name: 'Interviews' })
    expect(interviews).toHaveTextContent('notes-scope')
    expect(interviews).toHaveTextContent('Goal interview · goal drafted')
    expect(screen.getByRole('region', { name: 'Next step' })).toHaveTextContent(
      'Continue the Goal interview'
    )
  })
})

describe('Overview while details load', () => {
  it('renders status data at once with quiet placeholders for tickets and progress', () => {
    const { container } = renderOverview(makeReaderFixture(), makeLoadState('loading', 'loading'))
    expect(sectionNames(container)).toEqual([
      'needs-you',
      'goals',
      'progress-pending',
      'workspace-details'
    ])
    expect(container.querySelectorAll('[data-trivium-goal-row]')).toHaveLength(4)
    expect(container.querySelector('[data-trivium-work]')).toBeNull()
    expect(
      container.querySelectorAll('[data-trivium-goal-row] [data-trivium-skeleton]')
    ).toHaveLength(4)
    expect(screen.getByRole('status', { name: 'Loading progress details…' })).toBeInTheDocument()
  })

  it('offers Retry when progress could not load', () => {
    const loadState = makeLoadState('ready', 'error')
    const { container } = renderOverview(makeReaderFixture(), loadState)
    const pending = requireElement(container.querySelector('[data-trivium-pending="error"]'))
    expect(pending).toHaveTextContent("Couldn't load progress details.")
    fireEvent.click(within(pending).getByRole('button', { name: 'Retry' }))
    expect(loadState.retry).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-trivium-work]')).not.toBeNull()
  })
})
