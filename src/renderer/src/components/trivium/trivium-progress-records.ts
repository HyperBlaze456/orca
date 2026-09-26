import type {
  TriviumCampaignPhase,
  TriviumGoalTier
} from '../../../../shared/trivium-workspace-status'
import {
  readTriviumDerivedOutcomes,
  readTriviumGoalAssessment,
  readTriviumGoalOutcome,
  readTriviumRecordedWork,
  type TriviumDerivedOutcome,
  type TriviumGoalAssessment,
  type TriviumGoalOutcome,
  type TriviumRecordedWork
} from './trivium-goal-work-records'
import {
  readPayloadCounts as counts,
  readPayloadOptionalText as optionalText,
  readPayloadRecords as records,
  readPayloadStrings as strings,
  readPayloadText as text
} from './trivium-payload-fields'
import { isTriviumRecord } from './trivium-workspace-query'

/**
 * The `trivium view progress` projection (trivium/view/progress.py). Feature work is grouped
 * under the adopted Goal it advances; the top-level campaigns carry only their four identity
 * fields, and every open question lives in `conflicts`.
 */
export type TriviumFeatureResult =
  | 'completed'
  | 'in-progress'
  | 'queued'
  | 'blocked'
  | 'deduplicated'
  | 'abandoned'

export const TRIVIUM_FEATURE_RESULTS: readonly TriviumFeatureResult[] = [
  'completed',
  'in-progress',
  'queued',
  'blocked',
  'deduplicated',
  'abandoned'
]

export type TriviumProgressFeature = {
  id: string
  title: string
  result: TriviumFeatureResult
  ticket: string | null
  /** What the episode reached, in the worker's words; empty for a Feature closed before episodes. */
  outcome: string
  mergedCommit: string | null
  /** The ticket the work was already done under (`deduplicated`). */
  existing: string | null
  /** The ticket that has to land first (`blocked`). */
  blocker: string | null
}

export type TriviumProgressMilestone = {
  campaignId: string
  proposalId: string
  summary: string
  drift: string[]
  tradeOffs: string[]
  promotionCandidates: string[]
}

export type TriviumProgressGoal = {
  id: string
  tier: TriviumGoalTier | null
  title: string
  features: TriviumProgressFeature[]
  milestones: TriviumProgressMilestone[]
  unknowns: { campaignId: string; text: string }[]
  ticketCount: number
  /** HEAD only (installed 0.15: null). */
  recordedWork: TriviumRecordedWork | null
  outcome: TriviumGoalOutcome | null
  assessment: TriviumGoalAssessment | null
  /** Tickets listed under this Goal: every descendant at HEAD, direct children on 0.15. */
  ticketIds: string[]
  derivedOutcomes: TriviumDerivedOutcome[]
}

export type TriviumProgressCampaign = {
  id: string
  goalId: string | null
  phase: TriviumCampaignPhase
  currentFeature: string | null
  consumed: { llmCalls: number; tokens: number } | null
}

export type TriviumProgressConflict =
  | { kind: 'paused'; campaignId: string; featureId: string | null; code: string; reason: string }
  | { kind: 'escalation'; campaignId: string; featureId: string | null; reasons: string[] }
  | { kind: 'contradiction'; campaignId: string; proposalId: string; text: string }
  | { kind: 'health'; health: string; executionPolicy: string; reasons: string[] }

export type TriviumMemoryStatement = {
  id: string
  subject: string
  relation: string
  object: string
  status: string
}

export type TriviumMemoryDelta = {
  current: Record<string, number>
  campaigns: Record<string, number>
  representative: { added: TriviumMemoryStatement[]; suspect: TriviumMemoryStatement[] }
}

export type TriviumProgress = {
  modelRevision: string | null
  theoryAuthority: Record<string, number>
  goals: TriviumProgressGoal[]
  campaigns: TriviumProgressCampaign[]
  conflicts: TriviumProgressConflict[]
  memory: TriviumMemoryDelta | null
}

function readFeature(raw: Record<string, unknown>, result: TriviumFeatureResult) {
  const episode = isTriviumRecord(raw.episode) ? raw.episode : null
  return {
    id: text(raw.feature_id),
    title: text(raw.title) || text(raw.feature_id),
    result,
    ticket: optionalText(raw.ticket),
    outcome: text(episode?.outcome),
    mergedCommit: optionalText(episode?.merged_commit),
    existing: optionalText(raw.existing),
    blocker: optionalText(raw.blocker)
  }
}

const FEATURE_BUCKETS: [string, TriviumFeatureResult][] = [
  ['in_progress', 'in-progress'],
  ['blocked', 'blocked'],
  ['queued', 'queued'],
  ['completed', 'completed'],
  ['deduplicated', 'deduplicated'],
  ['abandoned', 'abandoned']
]

function readGoal(raw: Record<string, unknown>): TriviumProgressGoal {
  const tier = raw.tier
  return {
    id: text(raw.goal_id),
    tier: tier === 'g0' || tier === 'g1' || tier === 'g2' || tier === 'g3' ? tier : null,
    title: text(raw.title) || text(raw.goal_id),
    features: FEATURE_BUCKETS.flatMap(([key, result]) =>
      records(raw[key]).map((feature) => readFeature(feature, result))
    ),
    milestones: records(raw.milestones).map((milestone) => ({
      campaignId: text(milestone.campaign_id),
      proposalId: text(milestone.proposal_id),
      summary: text(milestone.summary),
      drift: strings(milestone.drift),
      tradeOffs: strings(milestone.trade_offs),
      promotionCandidates: strings(milestone.promotion_candidates)
    })),
    unknowns: records(raw.unknowns).flatMap((unknown) =>
      typeof unknown.text === 'string' && unknown.text
        ? [{ campaignId: text(unknown.campaign_id), text: unknown.text }]
        : []
    ),
    ticketCount: records(raw.tickets).length,
    recordedWork: readTriviumRecordedWork(raw.recorded_work),
    outcome: readTriviumGoalOutcome(raw.outcome),
    assessment: readTriviumGoalAssessment(raw.assessment),
    ticketIds: records(raw.tickets).flatMap((ticket) =>
      typeof ticket.ticket_id === 'string' && ticket.ticket_id ? [ticket.ticket_id] : []
    ),
    derivedOutcomes: readTriviumDerivedOutcomes(raw.derived_outcomes)
  }
}

function readConflict(raw: Record<string, unknown>): TriviumProgressConflict | null {
  switch (raw.kind) {
    case 'paused':
      return {
        kind: 'paused',
        campaignId: text(raw.campaign_id),
        featureId: optionalText(raw.feature_id),
        code: text(raw.code),
        reason: text(raw.reason)
      }
    case 'escalation':
      return {
        kind: 'escalation',
        campaignId: text(raw.campaign_id),
        featureId: optionalText(raw.feature_id),
        reasons: strings(raw.reasons)
      }
    case 'contradiction':
      return typeof raw.text === 'string' && raw.text
        ? {
            kind: 'contradiction',
            campaignId: text(raw.campaign_id),
            proposalId: text(raw.proposal_id),
            text: raw.text
          }
        : null
    case 'health':
      return {
        kind: 'health',
        health: text(raw.health),
        executionPolicy: text(raw.execution_policy),
        reasons: strings(raw.reasons)
      }
    default:
      return null
  }
}

function readStatements(value: unknown): TriviumMemoryStatement[] {
  return records(value).flatMap((item) =>
    typeof item.id === 'string'
      ? [
          {
            id: item.id,
            subject: text(item.subject),
            relation: text(item.relation),
            object: text(item.object),
            status: text(item.status)
          }
        ]
      : []
  )
}

export function readTriviumProgress(data?: Record<string, unknown>): TriviumProgress | null {
  if (!data || !Array.isArray(data.campaigns)) {
    return null
  }
  const consumedByCampaign = new Map(
    records(data.micro).flatMap((entry) => {
      const consumed = isTriviumRecord(entry.consumed) ? entry.consumed : null
      return typeof entry.campaign_id === 'string' && consumed
        ? [
            [
              entry.campaign_id,
              {
                llmCalls: typeof consumed.llm_calls === 'number' ? consumed.llm_calls : 0,
                tokens: typeof consumed.tokens === 'number' ? consumed.tokens : 0
              }
            ] as const
          ]
        : []
    })
  )
  const memory = isTriviumRecord(data.memory_delta) ? data.memory_delta : null
  const representative = isTriviumRecord(memory?.representative) ? memory.representative : null
  return {
    modelRevision: optionalText(data.model_revision),
    theoryAuthority: counts(data.theory_authority),
    goals: records(data.goals).map(readGoal),
    campaigns: records(data.campaigns).map((campaign) => ({
      id: text(campaign.campaign_id),
      goalId: optionalText(campaign.goal_id),
      phase: text(campaign.phase),
      currentFeature: optionalText(campaign.current_feature),
      consumed: consumedByCampaign.get(text(campaign.campaign_id)) ?? null
    })),
    conflicts: records(data.conflicts).flatMap((conflict) => {
      const read = readConflict(conflict)
      return read ? [read] : []
    }),
    memory: memory
      ? {
          current: counts(memory.current),
          campaigns: counts(memory.campaigns),
          representative: {
            added: readStatements(representative?.added),
            suspect: readStatements(representative?.suspect)
          }
        }
      : null
  }
}

/** True when a Goal has something to say under the current Campaign filter. */
export function goalHasProgress(goal: TriviumProgressGoal): boolean {
  return (
    goal.features.length > 0 ||
    goal.milestones.length > 0 ||
    goal.unknowns.length > 0 ||
    goal.ticketCount > 0
  )
}
