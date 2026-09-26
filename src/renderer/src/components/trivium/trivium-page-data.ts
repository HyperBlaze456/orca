import { useCallback, useMemo } from 'react'
import type { TriviumWorkspaceStatus } from '../../../../shared/trivium-workspace-status'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries, type TriviumTreeEntry } from './trivium-goal-tree'
import { buildTriviumNeedsYou } from './trivium-needs-you'
import {
  triviumProjectionLoadState,
  triviumStaleNotice,
  type TriviumStaleNotice
} from './trivium-page-load'
import { triviumPageStorageKey } from './trivium-page-storage'
import { readTriviumProgress } from './trivium-progress-records'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import { readTriviumTickets } from './trivium-ticket-records'
import type { TriviumActiveWorkspace } from './use-trivium-active-workspace'
import { useTriviumChangeMarkers, type TriviumChangeMarkers } from './use-trivium-change-markers'
import { useTriviumNavigation, type TriviumNavigation } from './use-trivium-navigation'
import { useTriviumProjection, type TriviumProjectionQuery } from './use-trivium-projection'
import {
  useTriviumWorkspaceStatus,
  type TriviumWorkspaceStatusResult
} from './use-trivium-workspace-status'

const TICKETS_QUERY: TriviumProjectionQuery = { kind: 'tickets' }
const PROGRESS_QUERY: TriviumProjectionQuery = { kind: 'progress' }
const NO_ENTRIES: readonly TriviumTreeEntry[] = []

/** Everything the page frame draws once a harness answered. */
export type TriviumPageFrame = {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  changes: TriviumChangeMarkers
  loadState: TriviumReaderLoadState
  needsYouCount: number
  /** Per workspace and harness root; keys the frame so another harness starts fresh. */
  storageKey: string
}

export type TriviumPageData = {
  status: TriviumWorkspaceStatusResult
  /** Null until a harness answered (loading, refusals, no harness). */
  frame: TriviumPageFrame | null
  stale: TriviumStaleNotice | null
  /** Rereads the status; tickets and progress follow every status answer. */
  refresh: () => void
}

function harnessOf(status: TriviumWorkspaceStatusResult): TriviumWorkspaceStatus | null {
  return status.data && status.data.state !== 'no-harness' ? status.data : null
}

/**
 * The page's three reads and the model built from them (WO-1a wiring recipe). Tickets and
 * progress wait for a harness and reload on every status answer, as the file watch fires.
 */
export function useTriviumPageData(workspace: TriviumActiveWorkspace | null): TriviumPageData {
  const status = useTriviumWorkspaceStatus(
    workspace?.id ?? null,
    workspace?.path ?? null,
    workspace?.connectionId
  )
  const harness = harnessOf(status)
  const detailsWorkspace = harness && workspace ? workspace.id : null
  const tickets = useTriviumProjection(detailsWorkspace, TICKETS_QUERY, status.dataRevision)
  const progress = useTriviumProjection(detailsWorkspace, PROGRESS_QUERY, status.dataRevision)

  const ticketRecords = useMemo(() => readTriviumTickets(tickets.data), [tickets.data])
  const progressRecord = useMemo(() => readTriviumProgress(progress.data), [progress.data])
  const model = useMemo(
    () =>
      harness
        ? buildTriviumModel({ status: harness, tickets: ticketRecords, progress: progressRecord })
        : null,
    [harness, progressRecord, ticketRecords]
  )
  const entries = useMemo(() => (model ? buildTriviumTreeEntries(model) : NO_ENTRIES), [model])
  const storageKey =
    harness && workspace ? triviumPageStorageKey(workspace.id, harness.harness_root) : null
  const navigation = useTriviumNavigation({ storageKey, model, entries })
  const changes = useTriviumChangeMarkers(storageKey, model)
  const needsYouCount = useMemo(() => (model ? buildTriviumNeedsYou(model).length : 0), [model])

  const { refresh: refreshTickets } = tickets
  const { refresh: refreshProgress } = progress
  const retry = useCallback(() => {
    refreshTickets()
    refreshProgress()
  }, [refreshProgress, refreshTickets])
  const ticketsState = triviumProjectionLoadState(tickets)
  const progressState = triviumProjectionLoadState(progress)
  const loadState = useMemo(
    () => ({ tickets: ticketsState, progress: progressState, retry }),
    [progressState, retry, ticketsState]
  )

  return {
    status,
    frame:
      model && storageKey
        ? { model, entries, navigation, changes, loadState, needsYouCount, storageKey }
        : null,
    stale: triviumStaleNotice(status, harness ? [tickets, progress] : []),
    refresh: status.refresh
  }
}
