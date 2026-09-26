import type { TriviumWorkspaceStatus } from '../../../../shared/trivium-workspace-status'
import type { TriviumDerivedOutcome } from './trivium-goal-work-records'
import type {
  TriviumFeatureResult,
  TriviumProgress,
  TriviumProgressFeature
} from './trivium-progress-records'

/**
 * Lookups over the progress projection. HEAD repeats Features and derived outcomes on every
 * ancestor Goal, so each is keyed once by its own id.
 */
export type TriviumProgressIndex = {
  featuresByTicket: ReadonlyMap<string, readonly TriviumProgressFeature[]>
  proposalByTicket: ReadonlyMap<string, TriviumDerivedOutcome>
  /** Campaign id → the Goal it anchors on (progress campaigns, then open status campaigns). */
  campaignGoals: ReadonlyMap<string, string>
  /** Goal id → the completed Feature ids listed under it. */
  completedFeatureIds: ReadonlyMap<string, readonly string[]>
}

// trivium/view/progress.py `_WORK_STAGE`: the furthest stage wins when a Feature repeats.
const FEATURE_STAGE: Record<TriviumFeatureResult, number> = {
  queued: 0,
  deduplicated: 1,
  blocked: 2,
  abandoned: 3,
  'in-progress': 4,
  completed: 5
}

export function indexTriviumProgress(
  progress: TriviumProgress | null,
  status: TriviumWorkspaceStatus
): TriviumProgressIndex {
  const goals = progress?.goals ?? []
  const featureById = new Map<string, TriviumProgressFeature>()
  for (const feature of goals.flatMap((goal) => goal.features)) {
    const previous = featureById.get(feature.id)
    if (
      feature.id &&
      (!previous || FEATURE_STAGE[feature.result] > FEATURE_STAGE[previous.result])
    ) {
      featureById.set(feature.id, feature)
    }
  }
  const featuresByTicket = new Map<string, TriviumProgressFeature[]>()
  for (const feature of featureById.values()) {
    const list = feature.ticket ? featuresByTicket.get(feature.ticket) : undefined
    if (list) {
      list.push(feature)
    } else if (feature.ticket) {
      featuresByTicket.set(feature.ticket, [feature])
    }
  }
  const proposalByTicket = new Map<string, TriviumDerivedOutcome>()
  for (const outcome of goals.flatMap((goal) => goal.derivedOutcomes)) {
    if (outcome.ticketId && !proposalByTicket.has(outcome.ticketId)) {
      proposalByTicket.set(outcome.ticketId, outcome)
    }
  }
  const campaignGoals = new Map<string, string>()
  for (const campaign of progress?.campaigns ?? []) {
    if (campaign.goalId && !campaignGoals.has(campaign.id)) {
      campaignGoals.set(campaign.id, campaign.goalId)
    }
  }
  for (const campaign of status.campaigns.open) {
    if (campaign.goal_id && !campaignGoals.has(campaign.campaign_id)) {
      campaignGoals.set(campaign.campaign_id, campaign.goal_id)
    }
  }
  const completedFeatureIds = new Map(
    goals.map((goal) => [
      goal.id,
      goal.features.filter((feature) => feature.result === 'completed').map((item) => item.id)
    ])
  )
  return { featuresByTicket, proposalByTicket, campaignGoals, completedFeatureIds }
}
