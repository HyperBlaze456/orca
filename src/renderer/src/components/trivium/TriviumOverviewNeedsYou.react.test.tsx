// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TriviumWorkspaceState } from '../../../../shared/trivium-workspace-status'
import type { TriviumModelInput } from './trivium-goal-model'
import { G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TriviumOverview } from './TriviumOverview'

// Verifier (WO-3 r1): the paused, escalation and health rows have no real-shaped fixture data,
// so these build them on decoded inputs.

afterEach(cleanup)

const LONG = 'UNBROKEN_PAUSE_REASON_IDENTIFIER_'.repeat(6)

function withDecisions(state: TriviumWorkspaceState, pausedReason: string) {
  return (input: TriviumModelInput): TriviumModelInput => ({
    ...input,
    status: {
      ...input.status,
      state,
      campaigns: {
        ...input.status.campaigns,
        open: [
          {
            campaign_id: 'campaign.sync-first-slice',
            goal_id: G2,
            phase: 'paused',
            pause_code: 'budget-exhausted',
            current_feature: null,
            holder: null,
            generation: 3
          }
        ]
      },
      escalations: [
        {
          feature_id: 'feature.sync-journal',
          intent_id: 'intent.sync-journal',
          reasons: ['scope-change', 'needs-user-input']
        }
      ]
    },
    progress: input.progress && {
      ...input.progress,
      conflicts: [
        {
          kind: 'paused',
          campaignId: 'campaign.search-cleanup',
          featureId: null,
          code: 'user-hold',
          reason: pausedReason
        },
        { kind: 'paused', campaignId: 'campaign.ghost', featureId: null, code: '', reason: '' },
        {
          kind: 'escalation',
          campaignId: 'campaign.sync-first-slice',
          featureId: 'feature.sync-journal',
          reasons: ['scope-change']
        },
        {
          kind: 'health',
          health: 'degraded',
          executionPolicy: 'hold-new-campaigns',
          reasons: ['3 suspect statements', 'stale theory']
        },
        ...input.progress.conflicts
      ]
    }
  })
}

function renderOverview(fixture: ReaderFixture) {
  const navigation = makeReaderNavigation()
  const view = renderWithTooltips(
    <TriviumOverview
      model={fixture.model}
      entries={fixture.entries}
      navigation={navigation}
      changes={new Map()}
      loadState={makeLoadState()}
    />
  )
  return { ...view, navigation }
}

function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[data-trivium-needs-you]')].map(requireElement)
}

describe.each(['head', 'installed'] as const)('Needs you decisions on the %s fixture', (binary) => {
  it('orders paused, escalation, health, milestone, then candidates', () => {
    const fixture = makeReaderFixture(
      binary,
      undefined,
      withDecisions('paused', 'Campaign campaign.search-cleanup paused after 2 Goal interview(s)')
    )
    const { container } = renderOverview(fixture)
    expect(rows(container).map((row) => row.getAttribute('data-trivium-needs-you'))).toEqual([
      'paused',
      'paused',
      'paused',
      'escalation',
      'health',
      'milestone',
      'candidate',
      'candidate',
      'candidate'
    ])
    const section = screen.getByRole('region', { name: 'Needs you' })
    expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent('Needs you9')
    expect(container.querySelector('[data-trivium-section]')).toHaveAttribute(
      'data-trivium-section',
      'needs-you'
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'A Campaign is paused until you decide'
    )
  })

  it('names each paused Campaign with its reason and opens its goal', () => {
    const fixture = makeReaderFixture(
      binary,
      undefined,
      withDecisions('paused', 'Campaign campaign.search-cleanup paused after 2 Goal interview(s)')
    )
    const { container, navigation } = renderOverview(fixture)
    const [fromStatus, fromConflict, unknown] = rows(container)
    expect(fromStatus).toHaveTextContent('sync-first-slice is paused')
    expect(fromStatus).toHaveTextContent('Reason: budget-exhausted')
    fireEvent.click(within(fromStatus).getByRole('button', { name: 'Open goal' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G2)

    expect(fromConflict).toHaveTextContent('search-cleanup is paused')
    expect(fromConflict).toHaveTextContent('Campaign search-cleanup paused after 2 Goal interviews')
    fireEvent.click(within(fromConflict).getByRole('button', { name: 'Open goal' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G1_SEARCH)

    expect(unknown).toHaveTextContent('ghost is paused')
    expect(unknown).toHaveTextContent('No reason recorded')
    expect(within(unknown).queryByRole('button')).toBeNull()
  })

  it('shows the escalation reasons and the degraded theory health', () => {
    const fixture = makeReaderFixture(binary, undefined, withDecisions('escalated', 'held'))
    const { container, navigation } = renderOverview(fixture)
    const escalation = requireElement(
      container.querySelector('[data-trivium-needs-you="escalation"]')
    )
    expect(escalation).toHaveTextContent('sync-journal needs your decision')
    expect(escalation).toHaveTextContent('scope-change · needs-user-input')
    fireEvent.click(within(escalation).getByRole('button', { name: 'Open goal' }))
    expect(navigation.openItem).toHaveBeenLastCalledWith(G2)

    const health = requireElement(container.querySelector('[data-trivium-needs-you="health"]'))
    expect(health).toHaveTextContent('Theory health is degraded')
    expect(health).toHaveTextContent('3 suspect statements · stale theory')
    expect(health).toHaveTextContent('Execution policy: hold-new-campaigns')
    expect(within(health).queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Work is waiting on your decision'
    )
  })

  it('wraps a long unbroken pause reason inside its row', () => {
    const fixture = makeReaderFixture(binary, undefined, withDecisions('paused', LONG))
    const { container } = renderOverview(fixture)
    const row = rows(container)[1]
    expect(row).toHaveTextContent(LONG)
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
    let wrapped = false
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes(LONG)) {
        wrapped = node.parentElement?.closest('.wrap-anywhere') !== null
      }
    }
    expect(wrapped).toBe(true)
  })
})

describe('Overview headline for a Goal draft', () => {
  it('shows interviews and guidance for goal-draft, not empty sections', () => {
    const fixture = makeReaderFixture('head', undefined, (input) => ({
      ...input,
      status: {
        ...input.status,
        state: 'goal-draft',
        state_reason: 'A Goal draft waits for review',
        milestone: null,
        tickets: { ...input.status.tickets, candidates: [] },
        goals: { ...input.status.goals, nodes: [], edges: [] }
      },
      progress: null
    }))
    const { container } = renderOverview(fixture)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'A Goal draft is ready for review'
    )
    const names = [...container.querySelectorAll('[data-trivium-section]')].map((element) =>
      element.getAttribute('data-trivium-section')
    )
    expect(names).toEqual(['interviews', 'guidance', 'workspace-details'])
    expect(screen.getByRole('region', { name: 'Next step' })).toHaveTextContent(
      'A Goal draft waits for your review.'
    )
  })
})
