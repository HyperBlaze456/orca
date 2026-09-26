import type { TriviumModel } from './trivium-goal-model'

/** Keys are the id path from a root joined by this separator, group segments included. */
export const TRIVIUM_TREE_KEY_SEPARATOR = '>'
/** The group that collects shown tickets without a shown parent Goal; it comes last. */
export const TRIVIUM_UNPARENTED_GROUP_ID = 'unparented#tickets'

export type TriviumTicketTreeEntry = { kind: 'ticket'; id: string; key: string }

/** The folded row for a Goal's direct tickets; `parentId` is null for the unparented group. */
export type TriviumTicketGroupEntry = {
  kind: 'group'
  id: string
  key: string
  parentId: string | null
  ticketIds: readonly string[]
  children: readonly TriviumTicketTreeEntry[]
}

export type TriviumGoalTreeEntry = {
  kind: 'goal'
  id: string
  key: string
  children: readonly TriviumTreeEntry[]
}

export type TriviumTreeEntry =
  | TriviumGoalTreeEntry
  | TriviumTicketGroupEntry
  | TriviumTicketTreeEntry

export function triviumTicketGroupId(parentId: string | null): string {
  return parentId === null ? TRIVIUM_UNPARENTED_GROUP_ID : `${parentId}#tickets`
}

function treeKey(path: readonly string[], id: string): string {
  return [...path, id].join(TRIVIUM_TREE_KEY_SEPARATOR)
}

function groupEntry(
  parentId: string | null,
  ticketIds: readonly string[],
  path: readonly string[]
): TriviumTicketGroupEntry {
  const id = triviumTicketGroupId(parentId)
  const inner = [...path, id]
  return {
    kind: 'group',
    id,
    key: treeKey(path, id),
    parentId,
    ticketIds,
    children: ticketIds.map((ticketId) => ({
      kind: 'ticket',
      id: ticketId,
      key: treeKey(inner, ticketId)
    }))
  }
}

function goalEntry(model: TriviumModel, id: string, path: readonly string[]): TriviumGoalTreeEntry {
  const inner = [...path, id]
  // A contribution cycle is invalid in trivium; the path guard only keeps a bad payload finite.
  const subGoals = model
    .subGoals(id)
    .filter((child) => !inner.includes(child))
    .map((child) => goalEntry(model, child, inner))
  const tickets = model.directTickets(id)
  return {
    kind: 'goal',
    id,
    key: treeKey(path, id),
    children: tickets.length > 0 ? [...subGoals, groupEntry(id, tickets, inner)] : subGoals
  }
}

/**
 * The outline: root Goals by tier then title, each with its sub-Goals and then one group of
 * its direct tickets; a Goal or ticket with two parents appears under both.
 */
export function buildTriviumTreeEntries(model: TriviumModel): TriviumTreeEntry[] {
  const entries: TriviumTreeEntry[] = model.rootGoals.map((id) => goalEntry(model, id, []))
  if (model.unparentedTickets.length > 0) {
    entries.push(groupEntry(null, model.unparentedTickets, []))
  }
  return entries
}

/** The key an id is opened at: its first-parent chain, a ticket through its parent's group. */
export function triviumCanonicalKey(model: TriviumModel, id: string): string | null {
  if (!model.isShown(id)) {
    return null
  }
  const chain = model.ancestors(id)
  if (!model.isTicket(id)) {
    return treeKey(chain, id)
  }
  const parentId = chain.at(-1) ?? null
  return treeKey([...chain, triviumTicketGroupId(parentId)], id)
}

/** Keys of the rows above `key`, root first: the rows to expand so it shows. */
export function triviumKeyAncestors(key: string): string[] {
  const parts = key.split(TRIVIUM_TREE_KEY_SEPARATOR)
  return parts
    .slice(1)
    .map((_, index) => parts.slice(0, index + 1).join(TRIVIUM_TREE_KEY_SEPARATOR))
}

/** Every Goal with children starts open; ticket groups start closed. */
export function triviumDefaultExpandedKeys(entries: readonly TriviumTreeEntry[]): Set<string> {
  const keys = new Set<string>()
  const walk = (list: readonly TriviumTreeEntry[]): void => {
    for (const entry of list) {
      if (entry.kind === 'goal' && entry.children.length > 0) {
        keys.add(entry.key)
        walk(entry.children)
      }
    }
  }
  walk(entries)
  return keys
}

/** Depth-first position of each Goal and ticket (first occurrence): "Goal order". */
export function triviumTreeOrder(entries: readonly TriviumTreeEntry[]): Map<string, number> {
  const order = new Map<string, number>()
  const walk = (list: readonly TriviumTreeEntry[]): void => {
    for (const entry of list) {
      if (entry.kind !== 'group' && !order.has(entry.id)) {
        order.set(entry.id, order.size)
      }
      if (entry.kind !== 'ticket') {
        walk(entry.children)
      }
    }
  }
  walk(entries)
  return order
}
