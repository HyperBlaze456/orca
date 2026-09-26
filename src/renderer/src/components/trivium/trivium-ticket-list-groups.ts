import { compareNumericLocaleText } from '@/lib/locale-text-collators'
import type { TriviumModel } from './trivium-goal-model'
import { TRIVIUM_TICKET_LIST_ORDER, type TriviumTicketKind } from './trivium-ticket-kinds'
import type {
  TriviumTicketListGrouping,
  TriviumTicketListOrdering
} from './trivium-ticket-list-options'

/** One band of the ticket list; `all` is the single headerless group of "No grouping". */
export type TriviumTicketGroup =
  | { kind: 'status'; key: string; status: TriviumTicketKind; ids: readonly string[] }
  | { kind: 'goal'; key: string; goalId: string | null; ids: readonly string[] }
  | { kind: 'all'; key: string; ids: readonly string[] }

const UNPARENTED_GROUP_KEY = 'goal:none'

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Title, statement or id contains the query, ignoring case. */
export function triviumTicketMatches(model: TriviumModel, id: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) {
    return true
  }
  const statement = model.node(id)?.statement || model.ticket(id)?.statement || ''
  return [model.title(id), statement, id].some((text) => text.toLocaleLowerCase().includes(needle))
}

/** Done and abandoned tickets leave the list when "Show done tickets" is off. */
export function filterTriviumTickets(
  model: TriviumModel,
  ids: readonly string[],
  query: string,
  showDone: boolean
): string[] {
  return ids.filter((id) => {
    const kind = model.ticketKind(id)
    if (!showDone && (kind === 'done' || kind === 'abandoned')) {
      return false
    }
    return triviumTicketMatches(model, id, query)
  })
}

export function sortTriviumTickets(
  model: TriviumModel,
  ids: readonly string[],
  ordering: TriviumTicketListOrdering,
  treeOrder: ReadonlyMap<string, number>
): string[] {
  const byTitle = (a: string, b: string): number =>
    compareNumericLocaleText(model.title(a), model.title(b)) || compareIds(a, b)
  if (ordering === 'title') {
    return ids.toSorted(byTitle)
  }
  const rank = (id: string): number => treeOrder.get(id) ?? Number.MAX_SAFE_INTEGER
  return ids.toSorted((a, b) => rank(a) - rank(b) || byTitle(a, b))
}

/**
 * Groups in Linear's list order: by status closest to done first (approval sits where Linear
 * puts triage), by parent Goal in outline order with parentless tickets last, or one group.
 * Empty groups are never returned; ids keep the order they came in.
 */
export function groupTriviumTickets(
  model: TriviumModel,
  ids: readonly string[],
  grouping: TriviumTicketListGrouping,
  treeOrder: ReadonlyMap<string, number>
): TriviumTicketGroup[] {
  if (ids.length === 0) {
    return []
  }
  if (grouping === 'none') {
    return [{ kind: 'all', key: 'all', ids }]
  }
  if (grouping === 'status') {
    return TRIVIUM_TICKET_LIST_ORDER.flatMap((status): TriviumTicketGroup[] => {
      const members = ids.filter((id) => model.ticketKind(id) === status)
      return members.length > 0
        ? [{ kind: 'status', key: `status:${status}`, status, ids: members }]
        : []
    })
  }
  const byGoal = new Map<string | null, string[]>()
  for (const id of ids) {
    const goalId = model.parent(id)
    const members = byGoal.get(goalId)
    if (members) {
      members.push(id)
    } else {
      byGoal.set(goalId, [id])
    }
  }
  const rank = (goalId: string | null): number =>
    goalId === null
      ? Number.MAX_SAFE_INTEGER
      : (treeOrder.get(goalId) ?? Number.MAX_SAFE_INTEGER - 1)
  return [...byGoal.entries()]
    .toSorted(([a], [b]) => rank(a) - rank(b) || compareIds(a ?? '', b ?? ''))
    .map(([goalId, members]) => ({
      kind: 'goal',
      key: goalId === null ? UNPARENTED_GROUP_KEY : `goal:${goalId}`,
      goalId,
      ids: members
    }))
}
