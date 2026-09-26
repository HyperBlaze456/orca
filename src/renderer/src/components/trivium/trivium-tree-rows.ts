import { escapeRegex } from '../../../../shared/string-utils'
import type { TriviumModel } from './trivium-goal-model'
import type { TriviumTreeEntry } from './trivium-goal-tree'

/** A case-insensitive substring filter over titles, statements and ids. */
export type TriviumTreeFilter = {
  text: string
  /** Non-global, so `test` keeps no position between calls. */
  test: RegExp
  /** Global, for `matchAll` highlighting. */
  every: RegExp
}

/** One visible line of the outline. */
export type TriviumTreeRow = {
  entry: TriviumTreeEntry
  key: string
  id: string
  depth: number
  parentKey: string | null
  /** 1-based place among the rows shown under the same parent, and how many there are. */
  position: number
  siblings: number
  /** Last of the rows shown under the same parent. */
  last: boolean
  /** `last` of each row above this one, root first (length = depth). */
  ancestorLast: readonly boolean[]
  /** The entry has children in the outline, shown or not. */
  hasChildren: boolean
  expanded: boolean
  /** Expand and collapse apply; while filtering the filter decides what is open. */
  toggleable: boolean
  /** Shown only as the path to a filter match (group rows never match themselves). */
  dimmed: boolean
}

export type TriviumTreeRowOptions = {
  expanded: ReadonlySet<string>
  filter: TriviumTreeFilter | null
  matches: (id: string) => boolean
}

/** A run of text; `offset` is where it starts in the whole text. */
export type TriviumTextSegment = { offset: number; text: string; match: boolean }

export function triviumTreeFilter(text: string): TriviumTreeFilter | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  const source = escapeRegex(trimmed)
  return { text: trimmed, test: new RegExp(source, 'iu'), every: new RegExp(source, 'giu') }
}

/** Title, statement or id contains the filter text. */
export function triviumTreeItemMatches(
  model: TriviumModel,
  id: string,
  filter: TriviumTreeFilter
): boolean {
  const statement = model.node(id)?.statement || model.ticket(id)?.statement || ''
  return [model.title(id), statement, id].some((text) => filter.test.test(text))
}

function childrenOf(entry: TriviumTreeEntry): readonly TriviumTreeEntry[] {
  return entry.kind === 'ticket' ? [] : entry.children
}

/**
 * Flattens the outline into the rows on screen. Without a filter a row's children show when
 * its key is expanded; with one, only rows whose subtree holds a match show, every row on the
 * way to a match is open, and rows that do not match themselves are dimmed.
 */
export function buildTriviumTreeRows(
  entries: readonly TriviumTreeEntry[],
  { expanded, filter, matches }: TriviumTreeRowOptions
): TriviumTreeRow[] {
  const matched = new Map<string, boolean>()
  const itemMatches = (id: string): boolean => {
    let hit = matched.get(id)
    if (hit === undefined) {
      hit = matches(id)
      matched.set(id, hit)
    }
    return hit
  }
  const shownByKey = new Map<string, boolean>()
  const shown = (entry: TriviumTreeEntry): boolean => {
    if (!filter) {
      return true
    }
    let hit = shownByKey.get(entry.key)
    if (hit === undefined) {
      hit = (entry.kind !== 'group' && itemMatches(entry.id)) || childrenOf(entry).some(shown)
      shownByKey.set(entry.key, hit)
    }
    return hit
  }

  const rows: TriviumTreeRow[] = []
  const walk = (
    list: readonly TriviumTreeEntry[],
    depth: number,
    parentKey: string | null,
    ancestorLast: readonly boolean[]
  ): void => {
    const visible = list.filter(shown)
    visible.forEach((entry, index) => {
      const last = index === visible.length - 1
      const children = childrenOf(entry)
      const hasChildren = children.length > 0
      const open = filter ? children.some(shown) : hasChildren && expanded.has(entry.key)
      rows.push({
        entry,
        key: entry.key,
        id: entry.id,
        depth,
        parentKey,
        position: index + 1,
        siblings: visible.length,
        last,
        ancestorLast,
        hasChildren,
        expanded: open,
        toggleable: hasChildren && !filter,
        dimmed: filter !== null && (entry.kind === 'group' || !itemMatches(entry.id))
      })
      if (open) {
        walk(children, depth + 1, entry.key, [...ancestorLast, last])
      }
    })
  }
  walk(entries, 0, null, [])
  return rows
}

/** `aria-expanded` for a row: absent when it cannot open (a leaf, or closed by the filter). */
export function triviumTreeRowAriaExpanded(row: TriviumTreeRow): boolean | undefined {
  return row.hasChildren && (row.toggleable || row.expanded) ? row.expanded : undefined
}

/** Splits text around every filter match, for `<mark>` highlighting. */
export function splitTriviumTreeMatches(
  text: string,
  filter: TriviumTreeFilter | null
): TriviumTextSegment[] {
  if (!filter) {
    return [{ offset: 0, text, match: false }]
  }
  const segments: TriviumTextSegment[] = []
  let offset = 0
  for (const found of text.matchAll(filter.every)) {
    if (found.index > offset) {
      segments.push({ offset, text: text.slice(offset, found.index), match: false })
    }
    segments.push({ offset: found.index, text: found[0], match: true })
    offset = found.index + found[0].length
  }
  if (offset < text.length || segments.length === 0) {
    segments.push({ offset, text: text.slice(offset), match: false })
  }
  return segments
}
