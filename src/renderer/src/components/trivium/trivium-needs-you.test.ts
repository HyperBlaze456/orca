import { describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import { G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import { makeTriviumFixtureModel, makeTriviumModelInput } from './trivium-model.fixture'
import { buildTriviumNeedsYou } from './trivium-needs-you'
import { readTriviumProgress } from './trivium-progress-records'

describe('buildTriviumNeedsYou', () => {
  it('lists the milestone to review, then the candidate tickets', () => {
    const items = buildTriviumNeedsYou(makeTriviumFixtureModel())
    expect(items.map((item) => item.kind)).toEqual([
      'milestone',
      'candidate',
      'candidate',
      'candidate'
    ])
    expect(items[0]).toMatchObject({
      campaignId: 'campaign.ticket-dogfood',
      goalId: G1_SEARCH,
      contradictions: 2,
      unknowns: 3,
      promotionCandidates: 1
    })
    expect(items[1]).toEqual({
      kind: 'candidate',
      ticketId: 'ticket.export-cutoff',
      title: 'A cancelled export deletes its half-written file and says where it stopped',
      parentId: G2,
      approveCommand: 'trivium model ticket approve ticket.export-cutoff --approved-by <user> --yes'
    })
  })

  it('orders paused, escalated, health, milestone and candidate items', () => {
    const input = makeTriviumModelInput()
    input.status.campaigns.open = [
      {
        campaign_id: 'campaign.stuck',
        goal_id: G2,
        phase: 'paused',
        pause_code: 'goal',
        current_feature: null,
        holder: null,
        generation: 2
      }
    ]
    input.status.escalations = [
      { feature_id: 'feature.risky', intent_id: '', reasons: ['Needs a decision.'] }
    ]
    const progress = readTriviumProgress({
      campaigns: [{ campaign_id: 'campaign.ticket-dogfood', goal_id: G1_SEARCH, phase: 'paused' }],
      goals: [],
      conflicts: [
        {
          kind: 'health',
          health: 'degraded',
          execution_policy: 'repair-only',
          reasons: ['Stale.']
        },
        {
          kind: 'escalation',
          campaign_id: 'campaign.stuck',
          feature_id: 'feature.risky',
          reasons: []
        },
        {
          kind: 'paused',
          campaign_id: 'campaign.ticket-dogfood',
          feature_id: null,
          code: 'budget',
          reason: 'Out of budget.'
        }
      ]
    })
    const items = buildTriviumNeedsYou(buildTriviumModel({ ...input, progress }))
    expect(items.map((item) => item.kind)).toEqual([
      'paused',
      'paused',
      'escalation',
      'health',
      'milestone',
      'candidate',
      'candidate',
      'candidate'
    ])
    expect(items[0]).toEqual({
      kind: 'paused',
      campaignId: 'campaign.stuck',
      goalId: G2,
      code: 'goal',
      reason: ''
    })
    expect(items[1]).toMatchObject({ code: 'budget', reason: 'Out of budget.', goalId: G1_SEARCH })
    expect(items[2]).toEqual({
      kind: 'escalation',
      featureId: 'feature.risky',
      intentId: null,
      campaignId: 'campaign.stuck',
      reasons: ['Needs a decision.']
    })
    expect(items[3]).toEqual({
      kind: 'health',
      health: 'degraded',
      executionPolicy: 'repair-only',
      reasons: ['Stale.']
    })
  })

  it('needs no progress to list what the status already knows', () => {
    const input = makeTriviumModelInput()
    const items = buildTriviumNeedsYou(buildTriviumModel({ ...input, progress: null }))
    expect(items.map((item) => item.kind)).toEqual([
      'milestone',
      'candidate',
      'candidate',
      'candidate'
    ])
    expect(items[0]).toMatchObject({ goalId: null })
  })
})
