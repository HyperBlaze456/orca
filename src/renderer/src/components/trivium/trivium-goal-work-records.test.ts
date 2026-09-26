import { describe, expect, it } from 'vitest'
import {
  readTriviumDerivedOutcomes,
  readTriviumGoalAssessment,
  readTriviumGoalOutcome,
  readTriviumRecordedWork
} from './trivium-goal-work-records'

describe('Trivium per-Goal work records', () => {
  it('needs both ticket counts before recorded work replaces the derived count', () => {
    expect(readTriviumRecordedWork({ completed_tickets: 2 })).toBeNull()
    expect(readTriviumRecordedWork(null)).toBeNull()
    expect(
      readTriviumRecordedWork({
        completed_tickets: 2,
        outstanding_tickets: 1,
        completed_features: 'x'
      })
    ).toEqual({
      delivery: 'not-started',
      completedFeatures: 0,
      openFeatures: 0,
      abandonedFeatures: 0,
      completedTickets: 2,
      outstandingTickets: 1
    })
  })

  it('reads only the three outcomes', () => {
    expect(readTriviumGoalOutcome('achieved')).toBe('achieved')
    expect(readTriviumGoalOutcome('not-achieved')).toBe('not-achieved')
    expect(readTriviumGoalOutcome('mostly-achieved')).toBeNull()
    expect(readTriviumGoalOutcome(undefined)).toBeNull()
  })

  it('reads an assessment leniently and drops criteria it cannot name', () => {
    expect(
      readTriviumGoalAssessment({
        delivery: 'delivered',
        outcome: 'achieved',
        criteria: [
          { criterion_id: 'criterion.fast-merge', verdict: 'met', evidence: ['evidence.run'] },
          { text: 'Offline for a day', verdict: 'not-met' },
          { verdict: 'met' },
          'junk'
        ],
        assessed_by: 'user',
        explanation: 'Measured on the pilot group.'
      })
    ).toEqual({
      delivery: 'delivered',
      outcome: 'achieved',
      criteria: [
        { text: 'criterion.fast-merge', verdict: 'met' },
        { text: 'Offline for a day', verdict: 'not-met' }
      ],
      assessedBy: 'user',
      explanation: 'Measured on the pilot group.'
    })
    expect(readTriviumGoalAssessment({})).toEqual({
      delivery: 'not-started',
      outcome: 'unassessed',
      criteria: [],
      assessedBy: null,
      explanation: null
    })
    expect(readTriviumGoalAssessment('nope')).toBeNull()
  })

  it('finds the proposed ticket from ticket_id, ticket or the approve command', () => {
    expect(
      readTriviumDerivedOutcomes([
        { feature_id: 'feature.a', hypothesis: 'A', ticket_id: 'goal.g3-ticket', approve: null },
        { feature_id: 'feature.b', ticket: 'ticket.b' },
        {
          feature_id: 'feature.c',
          hypothesis: 'C',
          approve: 'trivium model ticket approve ticket.c.v2. --approved-by <user> --yes'
        },
        { feature_id: 'feature.d', approve: 'milestone review' },
        { hypothesis: 'no ids at all' },
        'junk'
      ])
    ).toEqual([
      { featureId: 'feature.a', hypothesis: 'A', approve: null, ticketId: 'goal.g3-ticket' },
      { featureId: 'feature.b', hypothesis: '', approve: null, ticketId: 'ticket.b' },
      {
        featureId: 'feature.c',
        hypothesis: 'C',
        approve: 'trivium model ticket approve ticket.c.v2. --approved-by <user> --yes',
        ticketId: 'ticket.c.v2'
      },
      { featureId: 'feature.d', hypothesis: '', approve: 'milestone review', ticketId: null }
    ])
  })
})
