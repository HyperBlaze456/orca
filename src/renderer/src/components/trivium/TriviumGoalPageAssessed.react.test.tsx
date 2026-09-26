// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TriviumModelInput } from './trivium-goal-model'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { triviumWorkText } from './trivium-reader-text'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips,
  requireElement
} from './trivium-reader-test-harness'
import { makeReaderFixture, type ReaderFixture } from './trivium-reader-model.fixture'
import { TriviumGoalPage } from './TriviumGoalPage'
import { TriviumOverview } from './TriviumOverview'

// Verifier (WO-3 r1): assessed criteria and outcomes have no real-shaped fixture data, so these
// build them on decoded HEAD inputs; plus Goal relations and the A8 split of work and outcome.

afterEach(cleanup)

function assessed(input: TriviumModelInput): TriviumModelInput {
  const progress = input.progress
  if (!progress) {
    return input
  }
  return {
    ...input,
    progress: {
      ...progress,
      goals: progress.goals.map((goal) => {
        if (goal.id === G1_SYNC) {
          return {
            ...goal,
            outcome: 'achieved',
            assessment: {
              delivery: 'delivered',
              outcome: 'achieved',
              criteria: [
                { text: 'Every confirmed edit survives a sync', verdict: 'met' },
                { text: 'criterion.merge-report', verdict: 'not-met' },
                { text: 'criterion.offline-window', verdict: 'unknown' }
              ],
              assessedBy: 'user.kim',
              explanation: 'Checked against the nightly sync runs.'
            }
          }
        }
        if (goal.id === G2) {
          return {
            ...goal,
            outcome: 'not-achieved',
            assessment: {
              delivery: 'delivered',
              outcome: 'not-achieved',
              criteria: [{ text: 'criterion.merge-order', verdict: 'not-met' }],
              assessedBy: null,
              explanation: null
            }
          }
        }
        if (goal.id === G0) {
          return {
            ...goal,
            assessment: {
              delivery: 'in-progress',
              outcome: 'unassessed',
              criteria: [],
              assessedBy: null,
              explanation: null
            }
          }
        }
        return goal
      })
    }
  }
}

function withGoalDependency(input: TriviumModelInput): TriviumModelInput {
  return {
    ...input,
    status: {
      ...input.status,
      goals: {
        ...input.status.goals,
        edges: [
          ...input.status.goals.edges,
          {
            id: 'goal-edge.shared-search.depends-on.dependable-sync',
            source: G1_SEARCH,
            target: G1_SYNC,
            relation: 'depends-on'
          }
        ]
      }
    }
  }
}

function renderGoal(id: string, fixture: ReaderFixture) {
  const navigation = makeReaderNavigation({ view: 'item', id, anchor: null })
  const view = renderWithTooltips(
    <TriviumGoalPage
      model={fixture.model}
      id={id}
      entries={fixture.entries}
      navigation={navigation}
      changes={new Map()}
      loadState={makeLoadState()}
      currentTicketId={null}
    />
  )
  return { ...view, navigation }
}

function pill(container: HTMLElement, name: string): HTMLElement {
  return requireElement(container.querySelector(`[data-trivium-pill="${name}"]`))
}

describe('assessed Goals', () => {
  const fixture = makeReaderFixture('head', undefined, assessed)

  it('lists the assessed criteria with their verdicts and the explanation', () => {
    const { container } = renderGoal(G1_SYNC, fixture)
    expect(pill(container, 'outcome')).toHaveTextContent('Outcome Achieved')
    expect(
      pill(container, 'outcome').querySelector('[data-trivium-icon="outcome"]')
    ).toHaveAttribute('data-value', 'achieved')
    expect(container.querySelector('[data-trivium-criteria="none"]')).toBeNull()
    const criteria = requireElement(container.querySelector('[data-trivium-criteria="assessed"]'))
    expect(within(criteria).getByRole('heading', { level: 4 })).toHaveTextContent(
      'Success criteria3'
    )
    const items = [...criteria.querySelectorAll('li')]
    expect(items.map((item) => item.textContent)).toEqual([
      'Every confirmed edit survives a syncMet',
      'criterion.merge-reportNot met',
      'criterion.offline-windowUnknown'
    ])
    expect(
      items.map((item) =>
        item.querySelector('[data-trivium-icon="outcome"]')?.getAttribute('data-value')
      )
    ).toEqual(['achieved', 'not-achieved', 'unassessed'])
    expect(criteria).toHaveTextContent('Checked against the nightly sync runs.')
  })

  it('keeps work and outcome apart when they disagree', () => {
    const { container } = renderGoal(G2, fixture)
    expect(pill(container, 'outcome')).toHaveTextContent('Outcome Not achieved')
    expect(pill(container, 'work')).toHaveTextContent('Work 10/10 tickets done')
    expect(container.querySelector('[data-trivium-criteria="assessed"]')).toHaveTextContent(
      'criterion.merge-orderNot met'
    )
  })

  it('says no criteria are recorded when an assessment lists none', () => {
    const { container } = renderGoal(G0, fixture)
    expect(pill(container, 'outcome')).toHaveTextContent('Outcome Not assessed')
    expect(container.querySelector('[data-trivium-criteria="none"]')).toHaveTextContent(
      'No success criteria recorded yet.'
    )
  })

  it('shows each Goal its own outcome on the Overview', () => {
    const { container } = renderWithTooltips(
      <TriviumOverview
        model={fixture.model}
        entries={fixture.entries}
        navigation={makeReaderNavigation()}
        changes={new Map()}
        loadState={makeLoadState()}
      />
    )
    const outcomeOf = (id: string): [string | null, string | null] => {
      const icon = container.querySelector(
        `[data-trivium-goal-row="${id}"] [data-trivium-icon="outcome"]`
      )
      return [icon?.getAttribute('data-value') ?? null, icon?.parentElement?.textContent ?? null]
    }
    expect(outcomeOf(G1_SYNC)).toEqual(['achieved', 'Achieved'])
    expect(outcomeOf(G2)).toEqual(['not-achieved', 'Not achieved'])
    expect(outcomeOf(G0)).toEqual(['unassessed', 'Not assessed'])
    expect(outcomeOf(G1_SEARCH)).toEqual(['unassessed', 'Not assessed'])
  })
})

describe.each(['head', 'installed'] as const)('Goal page on the %s fixture', (binary) => {
  it('never reads finished work as an achieved Goal', () => {
    const fixture = makeReaderFixture(binary)
    for (const id of [G2, G1_SYNC]) {
      const { container } = renderGoal(id, fixture)
      expect(fixture.model.work(id).done).toBe(fixture.model.work(id).total)
      expect(pill(container, 'outcome')).toHaveTextContent('Outcome Not assessed')
      expect(pill(container, 'work')).toHaveTextContent(triviumWorkText(fixture.model.work(id)))
      expect(container).not.toHaveTextContent(/\bAchieved\b|\bDelivered\b|\bcomplete\b/i)
      cleanup()
    }
  })

  it('lists every descendant ticket count of a root Goal with none of its own', () => {
    const fixture = makeReaderFixture(binary)
    const { container, navigation } = renderGoal(G0, fixture)
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    const descendants = fixture.model.descendantTickets(G0)
    const work = fixture.model.ticketWork(descendants)
    expect(tickets).toHaveTextContent(`All ${descendants.length} tickets sit under sub-goals.`)
    expect(tickets).toHaveTextContent(`${work.done}/${work.total} done`)
    expect(within(tickets).getByRole('heading', { level: 3 })).toHaveTextContent(
      `Tickets${descendants.length}`
    )
    expect(
      [
        ...container.querySelectorAll('[data-trivium-section="sub-goals"] [data-trivium-goal-row]')
      ].map((row) => row.getAttribute('data-trivium-goal-row'))
    ).toEqual(fixture.model.subGoals(G0))
    fireEvent.click(within(tickets).getByRole('button', { name: 'Open in list' }))
    expect(navigation.openTickets).toHaveBeenLastCalledWith(G0)
  })

  it('shows depends-on and required-by pills only on Goals that have them', () => {
    const fixture = makeReaderFixture(binary, undefined, withGoalDependency)
    const search = renderGoal(G1_SEARCH, fixture)
    const dependsOn = requireElement(
      search.container.querySelector('[data-trivium-goal-relations]')
    )
    expect(dependsOn).toHaveTextContent(`Depends on${fixture.model.title(G1_SYNC)}`)
    expect(dependsOn).not.toHaveTextContent('Required by')
    fireEvent.click(within(dependsOn).getByRole('button'))
    expect(search.navigation.openItem).toHaveBeenLastCalledWith(G1_SYNC)
    cleanup()

    const sync = renderGoal(G1_SYNC, fixture)
    const requiredBy = requireElement(sync.container.querySelector('[data-trivium-goal-relations]'))
    expect(requiredBy).toHaveTextContent(`Required by${fixture.model.title(G1_SEARCH)}`)
    fireEvent.click(within(requiredBy).getByRole('button'))
    expect(sync.navigation.openItem).toHaveBeenLastCalledWith(G1_SEARCH)
    cleanup()

    const g2 = renderGoal(G2, fixture)
    expect(g2.container.querySelector('[data-trivium-goal-relations]')).toBeNull()
  })
})
