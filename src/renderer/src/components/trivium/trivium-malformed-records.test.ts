import { describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import { readTriviumProgress } from './trivium-progress-records'
import { readTriviumTickets } from './trivium-ticket-records'

describe('ticket records with malformed optional fields', () => {
  it('drops bad sub-records and reads bad scalars as empty', () => {
    const [ticket] = readTriviumTickets({
      tickets: [
        {
          id: 'ticket.x',
          state: 'queued',
          status: '',
          parent: 7,
          depends_on: ['ticket.y', null, 3],
          features: [null, 5, [], { feature_id: '' }, { feature_id: 'feature.x', campaign_id: 3 }],
          paths: 'src/a.ts',
          blocks: '2',
          awaiting: true,
          approve: ''
        }
      ]
    })
    expect(ticket).toMatchObject({
      state: null,
      status: null,
      parent: null,
      dependsOn: ['ticket.y'],
      features: [{ featureId: 'feature.x', mergedCommit: null, result: null, campaignId: null }],
      paths: [],
      blocks: 0,
      awaiting: null,
      approve: null
    })
  })

  it('still refuses a row that is not a record or has no id', () => {
    for (const row of [null, 'ticket.x', ['ticket.x'], { id: '' }, { id: 5 }]) {
      expect(() => readTriviumTickets({ tickets: [row] })).toThrow('unreadable response')
    }
    expect(readTriviumTickets({ tickets: 'nope' })).toEqual([])
    expect(readTriviumTickets(undefined)).toEqual([])
  })
})

describe('progress goals with malformed HEAD fields', () => {
  const goal = (fields: Record<string, unknown>) =>
    readTriviumProgress({ campaigns: [], goals: [{ goal_id: 'goal.x', ...fields }] })?.goals[0]

  it('reads recorded_work only with both ticket counts', () => {
    expect(
      goal({ recorded_work: { completed_tickets: '3', outstanding_tickets: 1 } })?.recordedWork
    ).toBeNull()
    expect(goal({ recorded_work: [] })?.recordedWork).toBeNull()
    expect(
      goal({ recorded_work: { completed_tickets: 2, outstanding_tickets: 0, delivery: 5 } })
        ?.recordedWork
    ).toEqual({
      delivery: 'not-started',
      completedFeatures: 0,
      openFeatures: 0,
      abandonedFeatures: 0,
      completedTickets: 2,
      outstandingTickets: 0
    })
    expect(
      goal({
        recorded_work: { completed_tickets: 1, outstanding_tickets: 0, delivery: 'handed-off' }
      })?.recordedWork?.delivery
    ).toBe('handed-off')
  })

  it('reads outcome and assessment leniently', () => {
    expect(goal({ outcome: 'excellent' })?.outcome).toBeNull()
    expect(goal({ outcome: 'achieved' })?.outcome).toBe('achieved')
    expect(goal({ assessment: 'yes' })?.assessment).toBeNull()
    expect(
      goal({
        assessment: {
          delivery: 'delivered',
          outcome: 'bogus',
          criteria: [null, {}, { criterion_id: 'c1' }, { text: 'Works offline', verdict: 'met' }],
          assessed_by: '',
          explanation: 7
        }
      })?.assessment
    ).toEqual({
      delivery: 'delivered',
      outcome: 'unassessed',
      criteria: [
        { text: 'c1', verdict: 'unknown' },
        { text: 'Works offline', verdict: 'met' }
      ],
      assessedBy: null,
      explanation: null
    })
  })

  it('reads ticket ids and derived outcomes from every accepted source', () => {
    const read = goal({
      tickets: [null, { ticket_id: 5 }, { ticket_id: 'ticket.a' }, { ticket_id: 'goal.b' }],
      derived_outcomes: [
        null,
        {},
        { hypothesis: 'no ids' },
        { feature_id: 'feature.a', approve: 'trivium model ticket approve ticket.a.b-c --yes' },
        { feature_id: 'feature.b', ticket: 'ticket.t' },
        { feature_id: 'feature.c', ticket_id: 'ticket.u', ticket: 'ticket.v' },
        { feature_id: 'feature.d', approve: 'milestone review' },
        {
          feature_id: 'feature.e',
          approve: 'trivium model ticket approve goal.b --approved-by <user> --yes'
        }
      ]
    })
    expect(read?.ticketIds).toEqual(['ticket.a', 'goal.b'])
    expect(read?.derivedOutcomes.map((item) => [item.featureId, item.ticketId])).toEqual([
      ['feature.a', 'ticket.a.b-c'],
      ['feature.b', 'ticket.t'],
      ['feature.c', 'ticket.u'],
      ['feature.d', null],
      // A `goal.`-prefixed ticket in the command is not parsed into a wrong id.
      ['feature.e', null]
    ])
  })

  it('passes an unknown Campaign phase and Goal status through to the model', () => {
    const progress = readTriviumProgress({
      campaigns: [{ campaign_id: 'campaign.x', goal_id: 'goal.x', phase: 'milestone-archived' }],
      goals: []
    })
    expect(progress?.campaigns[0].phase).toBe('milestone-archived')
    const model = buildTriviumModel({
      status: makeSmallTriviumStatus([['goal.x', 'g1', 'superseded-later']], []),
      tickets: [],
      progress
    })
    expect(model.node('goal.x')?.status).toBe('superseded-later')
    expect(model.isShown('goal.x')).toBe(true)
    expect(model.campaignGoal('campaign.x')).toBe('goal.x')
  })
})
