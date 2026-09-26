import { describe, expect, it } from 'vitest'
import type { TriviumTicketState } from '../../../../shared/trivium-workspace-status'
import {
  countTriviumTicketWork,
  deriveTriviumWork,
  recordedTriviumWork,
  type TriviumWorkSource
} from './trivium-work-progress'

const STATES: Record<string, TriviumTicketState> = {
  'ticket.done': 'done',
  'ticket.candidate-done': 'done',
  'ticket.abandoned': 'abandoned',
  'ticket.rejected-done': 'done',
  'ticket.elsewhere': 'done'
}

const PARENTS: Record<string, string[]> = {
  'ticket.done': ['goal.child'],
  'ticket.candidate-done': ['goal.retired'],
  'ticket.abandoned': ['goal.child'],
  'ticket.rejected-done': ['goal.child'],
  'ticket.elsewhere': ['goal.other'],
  'goal.child': ['goal.root'],
  'goal.retired': ['goal.root']
}

function ancestryOf(id: string): ReadonlySet<string> {
  const seen = new Set<string>()
  const pending = [id]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (!seen.has(next)) {
      seen.add(next)
      pending.push(...(PARENTS[next] ?? []))
    }
  }
  return seen
}

const SOURCE: TriviumWorkSource = {
  ticketIds: Object.keys(STATES),
  isActive: (id) => id !== 'ticket.rejected-done',
  stateOf: (id) => STATES[id] ?? 'open',
  ancestryOf,
  completedFeatureIds: new Map([
    ['goal.root', ['feature.a']],
    ['goal.child', ['feature.a', 'feature.b']],
    ['goal.other', ['feature.c']]
  ])
}

describe('Trivium work progress', () => {
  it('counts tickets by workflow state', () => {
    expect(countTriviumTicketWork([], () => 'done')).toEqual({ done: 0, total: 0, fraction: 0 })
    expect(
      countTriviumTicketWork(['a', 'b', 'c', 'd'], (id) => (id === 'd' ? 'open' : 'done'))
    ).toEqual({ done: 3, total: 4, fraction: 0.75 })
  })

  it('takes recorded work as sent', () => {
    expect(
      recordedTriviumWork({
        delivery: 'in-progress',
        completedFeatures: 16,
        openFeatures: 0,
        abandonedFeatures: 0,
        completedTickets: 13,
        outstandingTickets: 1
      })
    ).toEqual({
      done: 13,
      total: 14,
      fraction: 13 / 14,
      completedFeatures: 16,
      source: 'recorded-work'
    })
  })

  it('derives the same rule: active tickets under the Goal through any parent', () => {
    // The retired parent still carries its ticket to the root; an abandoned ticket is
    // outstanding; a rejected one does not count.
    expect(deriveTriviumWork('goal.root', SOURCE)).toEqual({
      done: 2,
      total: 3,
      fraction: 2 / 3,
      completedFeatures: 2,
      source: 'derived'
    })
    expect(deriveTriviumWork('goal.child', SOURCE)).toMatchObject({
      done: 1,
      total: 2,
      completedFeatures: 2
    })
    expect(deriveTriviumWork('goal.unknown', SOURCE)).toMatchObject({
      done: 0,
      total: 0,
      fraction: 0,
      completedFeatures: 0
    })
  })
})
