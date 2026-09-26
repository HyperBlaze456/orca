// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TriviumModelInput } from './trivium-goal-model'
import { G1_SYNC, G2 } from './trivium-model-tables.fixture'
import type { TriviumProgress } from './trivium-progress-records'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import {
  makeLoadState,
  makeReaderNavigation,
  renderWithTooltips
} from './trivium-reader-test-harness'
import { TriviumGoalPage } from './TriviumGoalPage'
import { TriviumOverview } from './TriviumOverview'
import { TriviumTicketListPage } from './TriviumTicketListPage'
import { TriviumTicketPage } from './TriviumTicketPage'

afterEach(cleanup)

// A long run with no break opportunity, and a long Korean word, in every kind of harness text.
const LONG = 'LONG_UNBROKEN_IDENTIFIER_'.repeat(8)
const KOREAN = '오프라인에서고친노트가다시연결될때순서대로합쳐진다'
const TEXT = `${LONG} ${KOREAN}`
const TICKET = 'ticket.export-cutoff'

function longProgress(progress: TriviumProgress | null): TriviumProgress | null {
  if (!progress) {
    return null
  }
  return {
    ...progress,
    goals: progress.goals.map((goal) => ({
      ...goal,
      features: goal.features.map((feature) => ({ ...feature, title: TEXT, outcome: TEXT })),
      milestones: goal.milestones.map((milestone) => ({
        ...milestone,
        summary: TEXT,
        drift: milestone.drift.map(() => TEXT),
        tradeOffs: milestone.tradeOffs.map(() => TEXT)
      })),
      unknowns: goal.unknowns.map((unknown, index) => ({ ...unknown, text: `${TEXT} ${index}` })),
      derivedOutcomes: goal.derivedOutcomes.map((outcome) => ({ ...outcome, hypothesis: TEXT }))
    })),
    conflicts: progress.conflicts.map((conflict, index) =>
      conflict.kind === 'contradiction' ? { ...conflict, text: `${TEXT} ${index}` } : conflict
    ),
    memory: progress.memory && {
      ...progress.memory,
      representative: {
        ...progress.memory.representative,
        added: progress.memory.representative.added.map((item) => ({ ...item, object: TEXT }))
      }
    }
  }
}

function longInput(input: TriviumModelInput): TriviumModelInput {
  const status = input.status
  return {
    ...input,
    status: {
      ...status,
      state_reason: `${status.state_reason} ${TEXT}`,
      goals: {
        ...status.goals,
        nodes: status.goals.nodes.map((node) =>
          node.id === G2 || node.id === TICKET
            ? { ...node, title: TEXT, statement: `${TEXT}\n\n${TEXT}` }
            : node
        )
      },
      milestone: status.milestone && { ...status.milestone, summary: TEXT },
      tickets: {
        ...status.tickets,
        candidates: status.tickets.candidates.map((item) =>
          item.id === TICKET ? { ...item, title: TEXT } : item
        )
      }
    },
    progress: longProgress(input.progress)
  }
}

const fixture = makeReaderFixture('head', undefined, longInput)

/** Text nodes holding `marker` with no wrapping or clipping ancestor inside `root`. */
function unwrapped(root: HTMLElement, marker: string, classes: readonly string[]): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const offenders: string[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.includes(marker)) {
      continue
    }
    let element = node.parentElement
    while (
      element &&
      element !== root &&
      !classes.some((name) => element?.classList.contains(name))
    ) {
      element = element.parentElement
    }
    if (!element || element === root) {
      offenders.push(node.parentElement?.outerHTML.slice(0, 160) ?? '')
    }
  }
  return offenders
}

function expectWrapped(root: HTMLElement): void {
  expect(root.textContent).toContain(LONG)
  expect(unwrapped(root, LONG, ['wrap-anywhere', 'break-all', 'truncate'])).toEqual([])
  expect(unwrapped(root, KOREAN, ['break-keep', 'truncate'])).toEqual([])
}

function openEverything(): void {
  for (const name of [
    /^Show all/,
    /^Show more$/,
    /^Read full milestone$/,
    /details$/,
    /^Examples/
  ]) {
    for (const button of screen.queryAllByRole('button', { name })) {
      fireEvent.click(button)
    }
  }
}

describe('reader text wraps Korean and long identifiers', () => {
  it('on the Overview', () => {
    const { container } = renderWithTooltips(
      <TriviumOverview
        model={fixture.model}
        entries={fixture.entries}
        navigation={makeReaderNavigation()}
        changes={new Map()}
        loadState={makeLoadState()}
      />
    )
    openEverything()
    expectWrapped(container)
  })

  it.each([G2, G1_SYNC])('on the Goal page of %s', (id) => {
    const { container } = renderWithTooltips(
      <TriviumGoalPage
        model={fixture.model}
        id={id}
        entries={fixture.entries}
        navigation={makeReaderNavigation({ view: 'item', id, anchor: null })}
        changes={new Map()}
        loadState={makeLoadState()}
        currentTicketId={null}
      />
    )
    openEverything()
    expectWrapped(container)
  })

  it('on the Ticket page and in the list', () => {
    const ticket = renderWithTooltips(
      <TriviumTicketPage
        model={fixture.model}
        id={TICKET}
        entries={fixture.entries}
        navigation={makeReaderNavigation({ view: 'item', id: TICKET, anchor: null })}
        changes={new Map()}
        loadState={makeLoadState()}
        onAskAgent={() => {}}
      />
    )
    openEverything()
    expectWrapped(ticket.container)
    cleanup()
    const list = renderWithTooltips(
      <TriviumTicketListPage
        model={fixture.model}
        entries={fixture.entries}
        navigation={makeReaderNavigation({ view: 'tickets', parentId: G2 })}
        changes={new Map()}
        loadState={makeLoadState()}
        parentId={G2}
        currentTicketId={null}
      />
    )
    expectWrapped(list.container)
  })
})
