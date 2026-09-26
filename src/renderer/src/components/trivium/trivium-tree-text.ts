import type { TriviumGoalStatus } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import type { TriviumChange } from './trivium-change-markers'

export type TriviumTreeChangeCounts = { added: number; changed: number }

export function triviumTreeTicketCount(count: number): string {
  return count === 1
    ? translate('trivium.tree.ticketCountOne', '1 ticket')
    : translate('trivium.tree.ticketCountMany', '{{count}} tickets', { count })
}

function goalCount(count: number): string {
  return count === 1
    ? translate('trivium.tree.goalCountOne', '1 goal')
    : translate('trivium.tree.goalCountMany', '{{count}} goals', { count })
}

/** What a closed Goal holds, e.g. "2 goals · 14 tickets"; empty parts are left out. */
export function triviumTreeContentsLabel(goals: number, tickets: number): string {
  return [goals > 0 ? goalCount(goals) : '', tickets > 0 ? triviumTreeTicketCount(tickets) : '']
    .filter(Boolean)
    .join(' · ')
}

/** New and changed items among `ids`, for the note on a closed row. */
export function countTriviumTreeChanges(
  ids: readonly string[],
  changes: ReadonlyMap<string, TriviumChange>
): TriviumTreeChangeCounts {
  const counts = { added: 0, changed: 0 }
  for (const id of new Set(ids)) {
    const change = changes.get(id)
    if (change?.kind === 'new') {
      counts.added += 1
    } else if (change) {
      counts.changed += 1
    }
  }
  return counts
}

export function triviumTreeNewLabel(count: number): string {
  return translate('trivium.tree.newCount', '{{count}} new', { count })
}

export function triviumTreeChangedLabel(count: number): string {
  return translate('trivium.tree.changedCount', '{{count}} changed', { count })
}

/** A shown Goal's status other than adopted; a status newer than this build shows as sent. */
export function triviumTreeGoalStatusLabel(status: TriviumGoalStatus): string {
  if (status === 'anticipated') {
    return translate('trivium.tree.status.anticipated', 'Anticipated')
  }
  if (status === 'candidate') {
    return translate('trivium.tree.status.candidate', 'Candidate')
  }
  return status.charAt(0).toUpperCase() + status.slice(1)
}
