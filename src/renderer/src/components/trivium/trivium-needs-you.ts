import type { TriviumModel } from './trivium-goal-model'

/** What waits on the user, in the order it blocks work. */
export type TriviumNeedsYouItem =
  | { kind: 'paused'; campaignId: string; goalId: string | null; code: string; reason: string }
  | {
      kind: 'escalation'
      featureId: string
      intentId: string | null
      campaignId: string | null
      reasons: readonly string[]
    }
  | { kind: 'health'; health: string; executionPolicy: string; reasons: readonly string[] }
  | {
      kind: 'milestone'
      campaignId: string
      goalId: string | null
      summary: string
      contradictions: number
      unknowns: number
      promotionCandidates: number
    }
  | {
      kind: 'candidate'
      ticketId: string
      title: string
      parentId: string | null
      approveCommand: string | null
    }

/**
 * Paused Campaigns, user escalations, degraded Theory health, the milestone to review, then
 * candidate tickets. Status facts come first so the list does not wait for progress.
 */
export function buildTriviumNeedsYou(model: TriviumModel): TriviumNeedsYouItem[] {
  const { status } = model
  const conflicts = model.progress?.conflicts ?? []
  const pausedConflicts = new Map<string, { code: string; reason: string }>()
  for (const item of conflicts) {
    if (item.kind === 'paused' && !pausedConflicts.has(item.campaignId)) {
      pausedConflicts.set(item.campaignId, item)
    }
  }
  const pausedOpen = status.campaigns.open.filter((campaign) => campaign.phase === 'paused')
  const pausedIds = new Set([
    ...pausedOpen.map((campaign) => campaign.campaign_id),
    ...pausedConflicts.keys()
  ])
  const paused = [...pausedIds].map((campaignId): TriviumNeedsYouItem => {
    const conflict = pausedConflicts.get(campaignId)
    const open = pausedOpen.find((campaign) => campaign.campaign_id === campaignId)
    return {
      kind: 'paused',
      campaignId,
      goalId: model.campaignGoal(campaignId),
      code: conflict?.code || open?.pause_code || '',
      reason: conflict?.reason ?? ''
    }
  })
  const escalations = status.escalations.map((item): TriviumNeedsYouItem => {
    const conflict = conflicts.find(
      (entry) => entry.kind === 'escalation' && entry.featureId === item.feature_id
    )
    return {
      kind: 'escalation',
      featureId: item.feature_id,
      intentId: item.intent_id || null,
      campaignId: conflict?.kind === 'escalation' ? conflict.campaignId : null,
      reasons: item.reasons
    }
  })
  const health = conflicts.flatMap((item): TriviumNeedsYouItem[] =>
    item.kind === 'health'
      ? [
          {
            kind: 'health',
            health: item.health,
            executionPolicy: item.executionPolicy,
            reasons: item.reasons
          }
        ]
      : []
  )
  const milestone: TriviumNeedsYouItem[] = status.milestone
    ? [
        {
          kind: 'milestone',
          campaignId: status.milestone.campaign_id,
          goalId: model.campaignGoal(status.milestone.campaign_id),
          summary: status.milestone.summary,
          contradictions: status.milestone.contradictions,
          unknowns: status.milestone.unknowns,
          promotionCandidates: status.milestone.promotion_candidates
        }
      ]
    : []
  const candidates = status.tickets.candidates.map((item): TriviumNeedsYouItem => ({
    kind: 'candidate',
    ticketId: item.id,
    title: item.title || model.title(item.id),
    parentId: item.parent || model.parent(item.id),
    approveCommand: item.approve_command || model.approveCommand(item.id)
  }))
  return [...paused, ...escalations, ...health, ...milestone, ...candidates]
}
