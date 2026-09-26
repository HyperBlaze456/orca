import type { TriviumTicketState } from '../../../../shared/trivium-workspace-status'
import type { TriviumRecordedWork } from './trivium-goal-work-records'

// Mirrors trivium/view/progress.py `_recorded_work`: every active ticket under a Goal counts,
// by its workflow state. Active = status not rejected/retired/replaced, so a candidate whose
// work finished counts as done, and an abandoned ticket stays outstanding.

export type TriviumTicketWork = { done: number; total: number; fraction: number }

export type TriviumWorkProgress = TriviumTicketWork & {
  completedFeatures: number
  /** `recorded-work` when the progress projection sent it (HEAD); `derived` otherwise. */
  source: 'recorded-work' | 'derived'
}

export type TriviumWorkSource = {
  /** Every G3 node id, whatever its status. */
  ticketIds: readonly string[]
  isActive: (id: string) => boolean
  stateOf: (id: string) => TriviumTicketState
  /** The id and every node it contributes to, over contributes-to edges of any status. */
  ancestryOf: (id: string) => ReadonlySet<string>
  /** Completed Feature ids the progress projection lists under each Goal id. */
  completedFeatureIds: ReadonlyMap<string, readonly string[]>
}

function workOf(done: number, total: number): TriviumTicketWork {
  return { done, total, fraction: total > 0 ? done / total : 0 }
}

export function countTriviumTicketWork(
  ids: readonly string[],
  stateOf: (id: string) => TriviumTicketState
): TriviumTicketWork {
  return workOf(ids.filter((id) => stateOf(id) === 'done').length, ids.length)
}

export function recordedTriviumWork(recorded: TriviumRecordedWork): TriviumWorkProgress {
  return {
    ...workOf(recorded.completedTickets, recorded.completedTickets + recorded.outstandingTickets),
    completedFeatures: recorded.completedFeatures,
    source: 'recorded-work'
  }
}

/** The same counts from the Goal graph and ticket records, for binaries without `recorded_work`. */
export function deriveTriviumWork(goalId: string, source: TriviumWorkSource): TriviumWorkProgress {
  const tickets = source.ticketIds.filter(
    (id) => source.isActive(id) && source.ancestryOf(id).has(goalId)
  )
  // HEAD rolls Features up to every ancestor; 0.15 lists them only where they anchor.
  const features = new Set<string>()
  for (const [listedUnder, ids] of source.completedFeatureIds) {
    if (source.ancestryOf(listedUnder).has(goalId)) {
      for (const id of ids) {
        features.add(id)
      }
    }
  }
  return {
    ...countTriviumTicketWork(tickets, source.stateOf),
    completedFeatures: features.size,
    source: 'derived'
  }
}
