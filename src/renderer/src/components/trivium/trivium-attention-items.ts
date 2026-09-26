import type {
  TriviumEscalation,
  TriviumMilestone,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import type { TriviumProgress } from './trivium-progress-records'
import type { TriviumTicket } from './trivium-ticket-records'

/**
 * The rows that wait on the user, in the order they block work: a paused Campaign, an
 * unanswered escalation, degraded Theory health, a blocked ticket, a milestone to review,
 * then a candidate ticket to approve. Status-projection facts stand in until the progress
 * projection has answered, so the queue never blanks while a slow host answers.
 */
export type TriviumAttentionItem =
  | { kind: 'paused'; campaignId: string; code: string; reason: string; goalId: string | null }
  | { kind: 'escalation'; featureId: string; intentId: string | null; reasons: string[] }
  | { kind: 'health'; health: string; reasons: string[] }
  | { kind: 'blocked'; ticket: TriviumTicket }
  | { kind: 'milestone'; milestone: TriviumMilestone; goalId: string | null }
  | { kind: 'candidate'; ticket: TriviumTicket }

export function buildTriviumAttention({
  status,
  tickets,
  progress,
  campaignId
}: {
  status: TriviumWorkspaceStatus
  tickets: TriviumTicket[]
  progress: TriviumProgress | null
  campaignId?: string
}): TriviumAttentionItem[] {
  const inScope = (id: string): boolean => !campaignId || id === campaignId
  const goalOf = (id: string): string | null =>
    progress?.campaigns.find((campaign) => campaign.id === id)?.goalId ??
    status.campaigns.open.find((campaign) => campaign.campaign_id === id)?.goal_id ??
    null
  const pausedFromProgress = progress?.conflicts.filter((item) => item.kind === 'paused') ?? []
  const paused: TriviumAttentionItem[] = pausedFromProgress.length
    ? pausedFromProgress
        .filter((item) => inScope(item.campaignId))
        .map((item) => ({
          kind: 'paused',
          campaignId: item.campaignId,
          code: item.code,
          reason: item.reason,
          goalId: goalOf(item.campaignId)
        }))
    : status.campaigns.open
        .filter((campaign) => campaign.phase === 'paused' && inScope(campaign.campaign_id))
        .map((campaign) => ({
          kind: 'paused',
          campaignId: campaign.campaign_id,
          code: campaign.pause_code ?? '',
          reason: '',
          goalId: campaign.goal_id
        }))
  const escalations: TriviumAttentionItem[] = status.escalations
    .filter(
      (item: TriviumEscalation) => !campaignId || escalationInCampaign(item, progress, campaignId)
    )
    .map((item) => ({
      kind: 'escalation',
      featureId: item.feature_id,
      intentId: item.intent_id || null,
      reasons: item.reasons
    }))
  const health: TriviumAttentionItem[] =
    progress?.conflicts.flatMap((item) =>
      item.kind === 'health'
        ? [{ kind: 'health' as const, health: item.health, reasons: item.reasons }]
        : []
    ) ?? []
  const blocked: TriviumAttentionItem[] = tickets
    .filter((ticket) => ticket.state === 'blocked')
    .map((ticket) => ({ kind: 'blocked', ticket }))
  const milestone: TriviumAttentionItem[] =
    status.milestone && inScope(status.milestone.campaign_id)
      ? [
          {
            kind: 'milestone',
            milestone: status.milestone,
            goalId: goalOf(status.milestone.campaign_id)
          }
        ]
      : []
  const candidates: TriviumAttentionItem[] = tickets
    .filter((ticket) => ticket.status === 'candidate')
    .map((ticket) => ({ kind: 'candidate', ticket }))
  return [...paused, ...escalations, ...health, ...blocked, ...milestone, ...candidates]
}

function escalationInCampaign(
  escalation: TriviumEscalation,
  progress: TriviumProgress | null,
  campaignId: string
): boolean {
  // The status projection does not name the Campaign; the progress conflicts do.
  return (
    progress?.conflicts.some(
      (item) =>
        item.kind === 'escalation' &&
        item.campaignId === campaignId &&
        item.featureId === escalation.feature_id
    ) ?? true
  )
}
