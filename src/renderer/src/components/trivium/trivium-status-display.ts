import type {
  TriviumGoalStatus,
  TriviumGoalTier,
  TriviumTicketState,
  TriviumWorkspaceState
} from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'dot' | 'ghost'

// Why: the palette stays quiet (STYLEGUIDE "monochrome and quiet"); only an escalation,
// which is the one state that blocks on the user, earns the destructive tint.
const STATE_BADGE_VARIANTS: Record<TriviumWorkspaceState, BadgeVariant> = {
  'no-harness': 'outline',
  'no-adopted-goal': 'outline',
  'goal-draft': 'outline',
  escalated: 'destructive',
  paused: 'outline',
  active: 'secondary',
  review: 'secondary',
  runnable: 'secondary'
}

const SHORT_ID_LENGTH = 12

export function triviumStateBadgeVariant(state: TriviumWorkspaceState): BadgeVariant {
  return STATE_BADGE_VARIANTS[state] ?? 'outline'
}

export function triviumStateLabel(state: TriviumWorkspaceState): string {
  switch (state) {
    case 'no-harness':
      return translate('auto.components.trivium.state.noHarness', 'No harness')
    case 'no-adopted-goal':
      return translate('auto.components.trivium.state.noAdoptedGoal', 'No adopted Goal')
    case 'goal-draft':
      return translate('auto.components.trivium.state.goalDraft', 'Goal draft')
    case 'escalated':
      return translate('auto.components.trivium.state.escalated', 'Escalated')
    case 'paused':
      return translate('auto.components.trivium.state.paused', 'Paused')
    case 'active':
      return translate('auto.components.trivium.state.active', 'Active')
    case 'review':
      return translate('auto.components.trivium.state.review', 'Review')
    case 'runnable':
      return translate('auto.components.trivium.state.runnable', 'Runnable')
  }
}

export function triviumTierLabel(tier: TriviumGoalTier): string {
  switch (tier) {
    case 'g0':
      return translate('auto.components.trivium.tier.g0', 'G0 · Purpose')
    case 'g1':
      return translate('auto.components.trivium.tier.g1', 'G1 · Outcome')
    case 'g2':
      return translate('auto.components.trivium.tier.g2', 'G2 · Capability')
    case 'g3':
      return translate('auto.components.trivium.tier.g3', 'G3 · Ticket')
  }
}

export function triviumGoalStatusBadgeVariant(status: TriviumGoalStatus): BadgeVariant {
  return status === 'rejected' ? 'destructive' : status === 'adopted' ? 'secondary' : 'outline'
}

export function triviumTicketStateLabel(state: TriviumTicketState): string {
  switch (state) {
    case 'open':
      return translate('auto.components.trivium.ticketState.open', 'Open')
    case 'in-progress':
      return translate('auto.components.trivium.ticketState.inProgress', 'In progress')
    case 'blocked':
      return translate('auto.components.trivium.ticketState.blocked', 'Blocked')
    case 'done':
      return translate('auto.components.trivium.ticketState.done', 'Done')
    case 'abandoned':
      return translate('auto.components.trivium.ticketState.abandoned', 'Abandoned')
  }
}

/** Publication ids are long hashes; the head is enough to compare two at a glance. */
export function shortenTriviumId(value: string): string {
  return value.length > SHORT_ID_LENGTH ? `${value.slice(0, SHORT_ID_LENGTH)}…` : value
}
