import { readTriviumPageStorage, writeTriviumPageStorage } from './trivium-page-storage'
import { isTriviumRecord } from './trivium-workspace-query'

export type TriviumTicketListGrouping = 'status' | 'goal' | 'none'
/** `goal` = the outline's depth-first order (Linear's manual order); `title` = alphabetical. */
export type TriviumTicketListOrdering = 'goal' | 'title'
export type TriviumTicketListProperty = 'id' | 'goal' | 'commit'
export type TriviumTicketListProperties = Readonly<Record<TriviumTicketListProperty, boolean>>

/** The Display menu of the ticket list. */
export type TriviumTicketListOptions = {
  grouping: TriviumTicketListGrouping
  ordering: TriviumTicketListOrdering
  properties: TriviumTicketListProperties
  showDone: boolean
}

export const TRIVIUM_TICKET_LIST_GROUPINGS: readonly TriviumTicketListGrouping[] = [
  'status',
  'goal',
  'none'
]
export const TRIVIUM_TICKET_LIST_ORDERINGS: readonly TriviumTicketListOrdering[] = ['goal', 'title']
export const TRIVIUM_TICKET_LIST_PROPERTIES: readonly TriviumTicketListProperty[] = [
  'id',
  'goal',
  'commit'
]

// Why ID starts hidden: ticket slugs are long and the title already names the ticket.
export const TRIVIUM_TICKET_LIST_DEFAULTS: TriviumTicketListOptions = {
  grouping: 'status',
  ordering: 'goal',
  properties: { id: false, goal: true, commit: true },
  showDone: true
}

/** A display preference, so one key for every workspace. */
export const TRIVIUM_TICKET_LIST_STORAGE_KEY = 'orca-trivium-page-v1:ticket-list-display'

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** A stored value as options; anything missing or unreadable keeps its default. */
export function readTriviumTicketListOptions(value: unknown): TriviumTicketListOptions {
  const defaults = TRIVIUM_TICKET_LIST_DEFAULTS
  if (!isTriviumRecord(value)) {
    return defaults
  }
  const properties = isTriviumRecord(value.properties) ? value.properties : {}
  return {
    grouping: pick(value.grouping, TRIVIUM_TICKET_LIST_GROUPINGS, defaults.grouping),
    ordering: pick(value.ordering, TRIVIUM_TICKET_LIST_ORDERINGS, defaults.ordering),
    properties: {
      id: flag(properties.id, defaults.properties.id),
      goal: flag(properties.goal, defaults.properties.goal),
      commit: flag(properties.commit, defaults.properties.commit)
    },
    showDone: flag(value.showDone, defaults.showDone)
  }
}

export function loadTriviumTicketListOptions(): TriviumTicketListOptions {
  return readTriviumTicketListOptions(readTriviumPageStorage(TRIVIUM_TICKET_LIST_STORAGE_KEY))
}

export function saveTriviumTicketListOptions(options: TriviumTicketListOptions): void {
  writeTriviumPageStorage(TRIVIUM_TICKET_LIST_STORAGE_KEY, options)
}
