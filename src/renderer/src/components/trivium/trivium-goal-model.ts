import type {
  TriviumGoalNode,
  TriviumTicketState,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import { compareNumericLocaleText } from '@/lib/locale-text-collators'
import { indexTriviumGoalEdges } from './trivium-goal-edges'
import type { TriviumDerivedOutcome, TriviumGoalOutcome } from './trivium-goal-work-records'
import { triviumIdSlug } from './trivium-harness-text'
import { indexTriviumProgress } from './trivium-progress-index'
import type {
  TriviumProgress,
  TriviumProgressFeature,
  TriviumProgressGoal
} from './trivium-progress-records'
import {
  orderTriviumTickets,
  resolveTriviumTicketKind,
  type TriviumTicketKind
} from './trivium-ticket-kinds'
import type { TriviumTicket } from './trivium-ticket-records'
import {
  countTriviumTicketWork,
  deriveTriviumWork,
  recordedTriviumWork,
  type TriviumTicketWork,
  type TriviumWorkProgress
} from './trivium-work-progress'

/** Refused or superseded narrowings; the page hides them. */
export const TRIVIUM_HIDDEN_GOAL_STATUSES: ReadonlySet<string> = new Set([
  'rejected',
  'retired',
  'replaced'
])

export type TriviumModelInput = {
  status: TriviumWorkspaceStatus
  tickets: readonly TriviumTicket[]
  progress: TriviumProgress | null
}

/**
 * The page's read model over the three projections. Every query takes an id and answers for
 * unknown ids with an empty value; list answers are shared and must not be mutated.
 */
export type TriviumModel = {
  status: TriviumWorkspaceStatus
  progress: TriviumProgress | null
  /** `publication.model_revision`, else the progress projection's revision. */
  revision: string | null
  /** Every goal node (G0–G3), hidden statuses included, in payload order. */
  nodes: readonly TriviumGoalNode[]
  /** Shown G3 ids in payload order. */
  ticketIds: readonly string[]
  /** The Campaign whose milestone waits for review (`state === 'review'`). */
  reviewCampaignId: string | null
  /** Shown Goals without a shown parent Goal, by tier then title. */
  rootGoals: readonly string[]
  /** Shown tickets without a shown parent Goal, in dependency order. */
  unparentedTickets: readonly string[]
  node: (id: string) => TriviumGoalNode | null
  ticket: (id: string) => TriviumTicket | null
  progressGoal: (id: string) => TriviumProgressGoal | null
  isShown: (id: string) => boolean
  isTicket: (id: string) => boolean
  title: (id: string) => string
  /** Shown non-ticket parents; the first is canonical (a ticket's recorded parent leads). */
  parents: (id: string) => readonly string[]
  parent: (id: string) => string | null
  children: (id: string) => readonly string[]
  /** First-parent chain, root first, without the id itself. */
  ancestors: (id: string) => readonly string[]
  /** Shown child Goals by tier, then title. */
  subGoals: (id: string) => readonly string[]
  /** Shown child tickets in dependency order. */
  directTickets: (id: string) => readonly string[]
  descendantGoals: (id: string) => readonly string[]
  descendantTickets: (id: string) => readonly string[]
  dependsOn: (id: string) => readonly string[]
  requiredBy: (id: string) => readonly string[]
  ticketKind: (id: string) => TriviumTicketKind
  /** Workflow state from the ticket record; `open` when unknown. */
  workState: (id: string) => TriviumTicketState
  /** Shown dependencies whose work is not done. */
  waitingOn: (id: string) => readonly string[]
  /** Progress Features mapped to the ticket, one per Feature id. */
  ticketFeatures: (id: string) => readonly TriviumProgressFeature[]
  ticketCommit: (id: string) => string | null
  proposal: (id: string) => TriviumDerivedOutcome | null
  approveCommand: (id: string) => string | null
  campaignGoal: (campaignId: string) => string | null
  work: (goalId: string) => TriviumWorkProgress
  ticketWork: (ticketIds: readonly string[]) => TriviumTicketWork
  outcome: (goalId: string) => TriviumGoalOutcome
}

function memoize<T>(read: (id: string) => T): (id: string) => T {
  const cache = new Map<string, { value: T }>()
  return (id) => {
    let entry = cache.get(id)
    if (!entry) {
      entry = { value: read(id) }
      cache.set(id, entry)
    }
    return entry.value
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function buildTriviumModel({ status, tickets, progress }: TriviumModelInput): TriviumModel {
  const nodeById = new Map<string, TriviumGoalNode>()
  for (const node of status.goals.nodes) {
    if (!nodeById.has(node.id)) {
      nodeById.set(node.id, node)
    }
  }
  const nodes = [...nodeById.values()]
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const progressById = new Map((progress?.goals ?? []).map((goal) => [goal.id, goal]))
  const candidateById = new Map(status.tickets.candidates.map((item) => [item.id, item]))

  const edges = indexTriviumGoalEdges(new Set(nodeById.keys()), status.goals.edges, tickets)
  const indexed = indexTriviumProgress(progress, status)

  const isShown = (id: string): boolean => {
    const node = nodeById.get(id)
    return node !== undefined && !TRIVIUM_HIDDEN_GOAL_STATUSES.has(node.status)
  }
  const isTicket = (id: string): boolean => nodeById.get(id)?.tier === 'g3'
  const title = (id: string): string => {
    const record = ticketById.get(id)
    return (
      nodeById.get(id)?.title ||
      (record && record.title !== id ? record.title : '') ||
      triviumIdSlug(id)
    )
  }
  const parents = memoize((id) => {
    const shown = (edges.parents.get(id) ?? []).filter((item) => isShown(item) && !isTicket(item))
    const recorded = ticketById.get(id)?.parent
    return recorded && shown.includes(recorded)
      ? [recorded, ...shown.filter((item) => item !== recorded)]
      : shown
  })
  const parent = (id: string): string | null => parents(id)[0] ?? null
  const children = memoize((id) =>
    isShown(id) && !isTicket(id) ? (edges.children.get(id) ?? []).filter(isShown) : []
  )
  const ancestors = memoize((id) => {
    const chain: string[] = []
    const seen = new Set([id])
    for (let next = parent(id); next !== null && !seen.has(next); next = parent(next)) {
      seen.add(next)
      chain.unshift(next)
    }
    return chain
  })
  const dependsOn = memoize((id) => (edges.dependsOn.get(id) ?? []).filter(isShown))
  const requiredBy = memoize((id) => (edges.requiredBy.get(id) ?? []).filter(isShown))
  const workState = (id: string): TriviumTicketState => ticketById.get(id)?.state ?? 'open'
  const ticketKind = memoize((id) => {
    const record = ticketById.get(id)
    return resolveTriviumTicketKind({
      status: nodeById.get(id)?.status ?? record?.status ?? null,
      awaiting: record?.awaiting ?? null,
      listedAsCandidate: candidateById.has(id),
      state: record?.state ?? null
    })
  })
  const byTierThenTitle = (a: string, b: string): number =>
    compareIds(nodeById.get(a)?.tier ?? '', nodeById.get(b)?.tier ?? '') ||
    compareNumericLocaleText(title(a), title(b)) ||
    compareIds(a, b)
  const subGoals = memoize((id) =>
    children(id)
      .filter((child) => !isTicket(child))
      .sort(byTierThenTitle)
  )
  const orderSource = { ticketKind, title, dependsOn }
  const directTickets = memoize((id) =>
    orderTriviumTickets(children(id).filter(isTicket), orderSource)
  )
  const descendants = memoize((id) => {
    const goals: string[] = []
    const found: string[] = []
    const seen = new Set([id])
    const walk = (goalId: string): void => {
      for (const child of subGoals(goalId)) {
        if (!seen.has(child)) {
          seen.add(child)
          goals.push(child)
          walk(child)
        }
      }
      for (const child of directTickets(goalId)) {
        if (!seen.has(child)) {
          seen.add(child)
          found.push(child)
        }
      }
    }
    walk(id)
    return { goals, tickets: found }
  })

  const ancestryOf = memoize((id) => {
    const seen = new Set<string>()
    const pending = [id]
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (!seen.has(next)) {
        seen.add(next)
        pending.push(...(edges.parents.get(next) ?? []))
      }
    }
    return seen
  })
  const workSource = {
    ticketIds: nodes.filter((node) => node.tier === 'g3').map((node) => node.id),
    isActive: isShown,
    stateOf: workState,
    ancestryOf,
    completedFeatureIds: indexed.completedFeatureIds
  }
  const features = (id: string): readonly TriviumProgressFeature[] =>
    indexed.featuresByTicket.get(id) ?? []
  const proposal = (id: string): TriviumDerivedOutcome | null =>
    indexed.proposalByTicket.get(id) ?? null
  const roots = nodes.filter((node) => isShown(node.id) && parents(node.id).length === 0)

  return {
    status,
    progress,
    revision: status.publication?.model_revision ?? progress?.modelRevision ?? null,
    nodes,
    ticketIds: nodes
      .filter((node) => node.tier === 'g3' && isShown(node.id))
      .map((node) => node.id),
    reviewCampaignId: status.state === 'review' ? (status.milestone?.campaign_id ?? null) : null,
    rootGoals: roots
      .filter((node) => node.tier !== 'g3')
      .map((node) => node.id)
      .sort(byTierThenTitle),
    unparentedTickets: orderTriviumTickets(
      roots.filter((node) => node.tier === 'g3').map((node) => node.id),
      orderSource
    ),
    node: (id) => nodeById.get(id) ?? null,
    ticket: (id) => ticketById.get(id) ?? null,
    progressGoal: (id) => progressById.get(id) ?? null,
    isShown,
    isTicket,
    title,
    parents,
    parent,
    children,
    ancestors,
    subGoals,
    directTickets,
    descendantGoals: (id) => descendants(id).goals,
    descendantTickets: (id) => descendants(id).tickets,
    dependsOn,
    requiredBy,
    ticketKind,
    workState,
    waitingOn: memoize((id) => dependsOn(id).filter((item) => workState(item) !== 'done')),
    ticketFeatures: features,
    ticketCommit: (id) =>
      features(id).find((item) => item.mergedCommit)?.mergedCommit ??
      ticketById.get(id)?.features.find((item) => item.mergedCommit)?.mergedCommit ??
      null,
    proposal,
    approveCommand: (id) =>
      candidateById.get(id)?.approve_command ||
      proposal(id)?.approve ||
      ticketById.get(id)?.approve ||
      null,
    campaignGoal: (campaignId) => indexed.campaignGoals.get(campaignId) ?? null,
    work: memoize((goalId) => {
      const recorded = progressById.get(goalId)?.recordedWork
      return recorded ? recordedTriviumWork(recorded) : deriveTriviumWork(goalId, workSource)
    }),
    ticketWork: (ids) => countTriviumTicketWork(ids, workState),
    outcome: (goalId) => progressById.get(goalId)?.outcome ?? 'unassessed'
  }
}
