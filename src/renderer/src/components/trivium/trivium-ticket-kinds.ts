import type { TriviumTicketState } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import { compareNumericLocaleText } from '@/lib/locale-text-collators'

/** What a ticket row shows: the approval wait first, otherwise the workflow state. */
export type TriviumTicketKind =
  | 'approval'
  | 'in-progress'
  | 'blocked'
  | 'open'
  | 'done'
  | 'abandoned'

/** Linear list order: closest to done first, then finished and dropped; approval is triage. */
export const TRIVIUM_TICKET_LIST_ORDER: readonly TriviumTicketKind[] = [
  'in-progress',
  'blocked',
  'open',
  'approval',
  'done',
  'abandoned'
]

/** Tree order inside a ticket group: what waits on the user first. */
export const TRIVIUM_TICKET_TREE_ORDER: readonly TriviumTicketKind[] = [
  'approval',
  'blocked',
  'in-progress',
  'open',
  'done',
  'abandoned'
]

export type TriviumTicketKindFacts = {
  /** Goal-node status, else the ticket record's status. */
  status: string | null
  awaiting: string | null
  /** Listed in `status.tickets.candidates`. */
  listedAsCandidate: boolean
  state: TriviumTicketState | null
}

export function resolveTriviumTicketKind(facts: TriviumTicketKindFacts): TriviumTicketKind {
  if (facts.status === 'candidate' || facts.awaiting === 'approve' || facts.listedAsCandidate) {
    return 'approval'
  }
  return facts.state ?? 'open'
}

export function triviumTicketKindLabel(kind: TriviumTicketKind): string {
  switch (kind) {
    case 'approval':
      return translate('trivium.ticketKind.approval', 'Needs approval')
    case 'in-progress':
      return translate('trivium.ticketKind.inProgress', 'In progress')
    case 'blocked':
      return translate('trivium.ticketKind.blocked', 'Blocked')
    case 'open':
      return translate('trivium.ticketKind.open', 'Open')
    case 'done':
      return translate('trivium.ticketKind.done', 'Done')
    case 'abandoned':
      return translate('trivium.ticketKind.abandoned', 'Abandoned')
  }
}

export type TriviumTicketOrderSource = {
  ticketKind: (id: string) => TriviumTicketKind
  title: (id: string) => string
  dependsOn: (id: string) => readonly string[]
}

/**
 * Tickets in dependency order (a dependency before its dependents), seeded by the tree kind
 * order then title. A dependency cycle is broken where it closes; every id appears once.
 */
export function orderTriviumTickets(
  ids: readonly string[],
  source: TriviumTicketOrderSource
): string[] {
  const members = new Set(ids)
  const rank = new Map(
    [...members].map((id) => [id, TRIVIUM_TICKET_TREE_ORDER.indexOf(source.ticketKind(id))])
  )
  const compare = (a: string, b: string): number =>
    (rank.get(a) ?? 0) - (rank.get(b) ?? 0) ||
    compareNumericLocaleText(source.title(a), source.title(b)) ||
    (a < b ? -1 : a > b ? 1 : 0)
  const ordered: string[] = []
  const placed = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string): void => {
    if (placed.has(id) || visiting.has(id)) {
      return
    }
    visiting.add(id)
    const dependencies = source.dependsOn(id).filter((dependency) => members.has(dependency))
    for (const dependency of dependencies.toSorted(compare)) {
      visit(dependency)
    }
    visiting.delete(id)
    placed.add(id)
    ordered.push(id)
  }
  for (const id of [...members].sort(compare)) {
    visit(id)
  }
  return ordered
}
