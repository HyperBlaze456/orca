import { describe, expect, it } from 'vitest'
import { makeTriviumModelStatus } from './trivium-model-graph.fixture'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import { G0, G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import { indexTriviumProgress } from './trivium-progress-index'
import { readTriviumProgress } from './trivium-progress-records'

describe('indexTriviumProgress', () => {
  it('keys repeated Features and proposals once across rolled-up Goals', () => {
    const index = indexTriviumProgress(
      readTriviumProgress(makeTriviumModelProgress('head')),
      makeTriviumModelStatus()
    )
    expect(index.featuresByTicket.get('ticket.sync-export')).toHaveLength(1)
    expect(index.proposalByTicket.get('ticket.export-cutoff')).toMatchObject({
      featureId: 'feature.export-cutoff'
    })
    expect(index.proposalByTicket.has('ticket.sync-export')).toBe(false)
    expect(index.campaignGoals.get('campaign.ticket-dogfood')).toBe(G1_SEARCH)
    expect(index.completedFeatureIds.get(G0)).toHaveLength(16)
    expect(index.completedFeatureIds.get(G2)).toHaveLength(10)
  })

  it('keeps the furthest stage of a Feature and falls back to open status Campaigns', () => {
    const status = makeTriviumModelStatus()
    status.campaigns.open = [
      {
        campaign_id: 'campaign.live',
        goal_id: G2,
        phase: 'active',
        pause_code: null,
        current_feature: null,
        holder: null,
        generation: 1
      }
    ]
    const index = indexTriviumProgress(
      readTriviumProgress({
        campaigns: [],
        goals: [
          { goal_id: G2, queued: [{ feature_id: 'feature.x', ticket: 'ticket.x' }] },
          { goal_id: G0, completed: [{ feature_id: 'feature.x', ticket: 'ticket.x' }] },
          { goal_id: G0, in_progress: [{ feature_id: 'feature.x', ticket: 'ticket.x' }] }
        ]
      }),
      status
    )
    expect(index.featuresByTicket.get('ticket.x')?.map((feature) => feature.result)).toEqual([
      'completed'
    ])
    expect(index.campaignGoals.get('campaign.live')).toBe(G2)
    expect(indexTriviumProgress(null, status).featuresByTicket.size).toBe(0)
  })
})
