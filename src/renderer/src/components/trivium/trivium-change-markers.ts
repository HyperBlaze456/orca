import { translate } from '@/i18n/i18n'
import { TRIVIUM_HIDDEN_GOAL_STATUSES, type TriviumModel } from './trivium-goal-model'
import { isTriviumRecord } from './trivium-workspace-query'

/** What the page remembers about one goal node between visits. */
export type TriviumSnapshotItem = {
  title: string
  statementDigest: string
  status: string
  tier: string
  /** Contribution parents over every status, so hiding a parent is not a move. */
  parents: readonly string[]
}

export type TriviumSnapshot = {
  modelRevision: string | null
  seenAt: number
  items: Readonly<Record<string, TriviumSnapshotItem>>
}

export type TriviumChangeField = 'tier' | 'status' | 'parents' | 'title' | 'statement'
/** `from`/`to` are digests for `statement` and comma-joined ids for `parents`. */
export type TriviumFieldChange = { field: TriviumChangeField; from: string; to: string }
export type TriviumChange =
  | { kind: 'new' }
  | { kind: 'changed'; fields: readonly TriviumFieldChange[] }
export type TriviumRemovedItem = { id: string; title: string }
export type TriviumChangeSet = {
  changes: ReadonlyMap<string, TriviumChange>
  removed: readonly TriviumRemovedItem[]
}

const isHidden = (status: string): boolean => TRIVIUM_HIDDEN_GOAL_STATUSES.has(status)

// FNV-1a: enough to notice an edited statement without keeping its text in storage.
function digestText(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193)
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}:${value.length}`
}

export function snapshotTriviumModel(model: TriviumModel, seenAt: number): TriviumSnapshot {
  const parents = new Map<string, Set<string>>()
  for (const edge of model.status.goals.edges) {
    if (edge.relation === 'contributes-to' && model.node(edge.target)) {
      parents.set(edge.source, (parents.get(edge.source) ?? new Set<string>()).add(edge.target))
    }
  }
  const items: Record<string, TriviumSnapshotItem> = {}
  for (const node of model.nodes) {
    items[node.id] = {
      title: node.title,
      statementDigest: digestText(node.statement),
      status: node.status,
      tier: node.tier,
      parents: [...(parents.get(node.id) ?? [])].sort()
    }
  }
  return { modelRevision: model.revision, seenAt, items }
}

function itemOf(snapshot: TriviumSnapshot, id: string): TriviumSnapshotItem | undefined {
  return Object.hasOwn(snapshot.items, id) ? snapshot.items[id] : undefined
}

function fieldChanges(
  before: TriviumSnapshotItem,
  after: TriviumSnapshotItem
): TriviumFieldChange[] {
  const pairs: [TriviumChangeField, string, string][] = [
    ['tier', before.tier, after.tier],
    ['status', before.status, after.status],
    ['parents', before.parents.join(','), after.parents.join(',')],
    ['title', before.title, after.title],
    ['statement', before.statementDigest, after.statementDigest]
  ]
  return pairs.flatMap(([field, from, to]) => (from === to ? [] : [{ field, from, to }]))
}

/**
 * New = shown now and absent before; changed = a remembered field differs; removed = shown
 * before and now gone or hidden. Without a previous snapshot nothing is marked.
 */
export function diffTriviumSnapshots(
  previous: TriviumSnapshot | null,
  next: TriviumSnapshot
): TriviumChangeSet {
  const changes = new Map<string, TriviumChange>()
  if (!previous) {
    return { changes, removed: [] }
  }
  for (const [id, after] of Object.entries(next.items)) {
    if (isHidden(after.status)) {
      continue
    }
    const before = itemOf(previous, id)
    const fields = before ? fieldChanges(before, after) : []
    if (!before) {
      changes.set(id, { kind: 'new' })
    } else if (fields.length > 0) {
      changes.set(id, { kind: 'changed', fields })
    }
  }
  const removed = Object.entries(previous.items).flatMap(([id, before]) => {
    const after = itemOf(next, id)
    return !isHidden(before.status) && (!after || isHidden(after.status))
      ? [{ id, title: before.title }]
      : []
  })
  return { changes, removed }
}

// A move needs a new parent; gaining one while keeping the others is not a move.
function describeParentChange(change: TriviumFieldChange, titleOf: (id: string) => string): string {
  const before = change.from ? change.from.split(',') : []
  const after = change.to ? change.to.split(',') : []
  const added = after.find((id) => !before.includes(id))
  const dropped = before.find((id) => !after.includes(id))
  if (!added) {
    return translate('trivium.change.leftParent', 'No longer under {{title}}', {
      title: titleOf(dropped ?? '')
    })
  }
  return dropped || before.length === 0
    ? translate('trivium.change.movedUnder', 'Moved under {{title}}', { title: titleOf(added) })
    : translate('trivium.change.alsoUnder', 'Also under {{title}}', { title: titleOf(added) })
}

function describeField(change: TriviumFieldChange, titleOf: (id: string) => string): string {
  switch (change.field) {
    case 'tier':
      return translate('trivium.change.tier', 'Tier {{from}} → {{to}}', {
        from: change.from.toUpperCase(),
        to: change.to.toUpperCase()
      })
    case 'status':
      return translate('trivium.change.status', 'Status {{from}} → {{to}}', {
        from: change.from,
        to: change.to
      })
    case 'parents':
      return describeParentChange(change, titleOf)
    case 'title':
      return translate('trivium.change.title', 'Title changed')
    case 'statement':
      return translate('trivium.change.statement', 'Description changed')
  }
}

/** A marker's words: "New since your last visit" or e.g. "Tier G2 → G3 · Title changed". */
export function describeTriviumChange(
  change: TriviumChange,
  titleOf: (id: string) => string
): string {
  return change.kind === 'new'
    ? translate('trivium.change.new', 'New since your last visit')
    : change.fields.map((field) => describeField(field, titleOf)).join(' · ')
}

function readSnapshotItem(value: unknown): TriviumSnapshotItem | null {
  if (
    !isTriviumRecord(value) ||
    typeof value.title !== 'string' ||
    typeof value.statementDigest !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.tier !== 'string' ||
    !Array.isArray(value.parents)
  ) {
    return null
  }
  return {
    title: value.title,
    statementDigest: value.statementDigest,
    status: value.status,
    tier: value.tier,
    // Sorted and unique like a fresh snapshot, so only a real parent change differs.
    parents: [...new Set(value.parents.filter((id): id is string => typeof id === 'string'))].sort()
  }
}

/** A stored snapshot, or null when it is missing or not one this build wrote. */
export function readTriviumSnapshot(value: unknown): TriviumSnapshot | null {
  if (
    !isTriviumRecord(value) ||
    !isTriviumRecord(value.items) ||
    typeof value.seenAt !== 'number'
  ) {
    return null
  }
  const items: Record<string, TriviumSnapshotItem> = {}
  for (const [id, raw] of Object.entries(value.items)) {
    const item = readSnapshotItem(raw)
    if (!item) {
      return null
    }
    items[id] = item
  }
  return {
    modelRevision: typeof value.modelRevision === 'string' ? value.modelRevision : null,
    seenAt: value.seenAt,
    items
  }
}
