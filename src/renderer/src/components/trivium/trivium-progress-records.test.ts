import { describe, expect, it } from 'vitest'
import { goalHasProgress, readTriviumProgress } from './trivium-progress-records'
import { makeTriviumProgressRecord } from './trivium-progress-records.fixture'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import { G0, G1_SEARCH, G2 } from './trivium-model-tables.fixture'

describe('readTriviumProgress', () => {
  it('reads Feature work from the Goal buckets, not from the campaign rows', () => {
    const progress = readTriviumProgress(makeTriviumProgressRecord())
    const outcome = progress?.goals.find((goal) => goal.id === 'goal.outcome')
    expect(outcome?.features.map((feature) => [feature.id, feature.result])).toEqual([
      ['feature.resume', 'in-progress'],
      ['feature.expired', 'blocked'],
      ['feature.limits', 'queued'],
      ['feature.checkpoint', 'completed'],
      ['feature.detect', 'completed']
    ])
    expect(outcome?.features[1].blocker).toBe('ticket.resume')
    expect(outcome?.features[3].outcome).toBe(
      'A checkpoint file is written after every confirmed chunk.'
    )
    expect(outcome?.features[3].mergedCommit).toBe('abc123def4567890')
    expect(outcome?.milestones[0]).toMatchObject({
      campaignId: 'campaign.uploads',
      summary: 'Checkpoints landed; retry policy is unverified.',
      promotionCandidates: ['mechanism.checkpoint-after-confirmed-chunk']
    })
    expect(outcome?.unknowns.map((unknown) => unknown.text)).toHaveLength(3)
    expect(progress?.campaigns).toEqual([
      {
        id: 'campaign.uploads',
        goalId: 'goal.outcome',
        phase: 'milestone-synthesized',
        currentFeature: null,
        consumed: { llmCalls: 42, tokens: 120_000 }
      }
    ])
    expect(progress?.conflicts.map((conflict) => conflict.kind)).toEqual([
      'contradiction',
      'contradiction'
    ])
    expect(progress?.memory?.current).toEqual({ invalid: 0, superseded: 3, suspect: 1, valid: 12 })
    expect(progress?.memory?.representative.added[0].subject).toBe('feature.checkpoint')
  })

  it('omits Goals with nothing to report and refuses a payload without campaigns', () => {
    const progress = readTriviumProgress(makeTriviumProgressRecord())
    expect(progress?.goals.filter(goalHasProgress).map((goal) => goal.id)).toEqual([
      'goal.outcome',
      'goal.retry'
    ])
    expect(readTriviumProgress({ goals: [] })).toBeNull()
    expect(readTriviumProgress(undefined)).toBeNull()
  })

  it('drops conflict rows it cannot read instead of failing the screen', () => {
    const progress = readTriviumProgress({
      campaigns: [],
      conflicts: [{ kind: 'surprise' }, { kind: 'contradiction', text: '' }, 'oops']
    })
    expect(progress?.conflicts).toEqual([])
    expect(progress?.memory).toBeNull()
  })
})

describe('readTriviumProgress across binaries', () => {
  it('reads recorded work, outcomes, ticket ids and derived outcomes from repo HEAD', () => {
    const progress = readTriviumProgress(makeTriviumModelProgress('head'))
    const root = progress?.goals.find((goal) => goal.id === G0)
    expect(root?.recordedWork).toEqual({
      delivery: 'in-progress',
      completedFeatures: 16,
      openFeatures: 0,
      abandonedFeatures: 0,
      completedTickets: 13,
      outstandingTickets: 1
    })
    expect(progress?.goals.map((goal) => goal.outcome)).toEqual([
      'unassessed',
      'unassessed',
      'unassessed',
      'unassessed'
    ])
    expect(root?.assessment).toBeNull()
    expect(root?.ticketIds).toHaveLength(14)
    expect(root?.derivedOutcomes).toHaveLength(8)
    expect(
      root?.derivedOutcomes.filter((item) => item.ticketId === null).map((item) => item.approve)
    ).toEqual(['milestone review', 'milestone review', 'milestone review'])
    const search = progress?.goals.find((goal) => goal.id === G1_SEARCH)
    expect(search?.derivedOutcomes[0]).toMatchObject({
      featureId: 'feature.index-reads-once',
      ticketId: 'ticket.index-reads-once',
      approve: 'trivium model ticket ratify ticket.index-reads-once --approved-by <user> --yes'
    })
  })

  it('leaves the HEAD-only fields empty for the installed binary', () => {
    const progress = readTriviumProgress(makeTriviumModelProgress('installed'))
    for (const goal of progress?.goals ?? []) {
      expect(goal).toMatchObject({ recordedWork: null, outcome: null, assessment: null })
    }
    expect(progress?.goals.find((goal) => goal.id === G0)?.ticketIds).toEqual([])
    expect(progress?.goals.find((goal) => goal.id === G2)?.ticketIds).toHaveLength(10)
    const bare = readTriviumProgress({
      campaigns: [{ campaign_id: 'campaign.x', goal_id: 'goal.x', phase: 'milestone-archived' }],
      goals: [{ goal_id: 'goal.x', tier: 'g1', title: 'Older binary' }]
    })
    expect(bare?.goals[0]).toMatchObject({
      recordedWork: null,
      outcome: null,
      assessment: null,
      ticketIds: [],
      derivedOutcomes: []
    })
    expect(bare?.campaigns[0].phase).toBe('milestone-archived')
  })
})
