import type { TriviumWorkspaceState } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'

/** The header's short state phrase: what the workspace waits on, never activity as progress. */
export function triviumStatePhrase(state: TriviumWorkspaceState): string {
  switch (state) {
    case 'review':
      return translate('trivium.state.review', 'Milestone ready for review')
    case 'runnable':
      return translate('trivium.state.runnable', 'Ready to run')
    case 'active':
      return translate('trivium.state.active', 'Campaign running')
    case 'paused':
      return translate('trivium.state.paused', 'Paused, needs your decision')
    case 'escalated':
      return translate('trivium.state.escalated', 'Needs your decision')
    case 'goal-draft':
      return translate('trivium.state.goalDraft', 'Goal draft to review')
    case 'no-adopted-goal':
      return translate('trivium.state.noAdoptedGoal', 'No Goal adopted')
    case 'no-harness':
      return translate('trivium.state.noHarness', 'Not set up in this workspace')
  }
}
