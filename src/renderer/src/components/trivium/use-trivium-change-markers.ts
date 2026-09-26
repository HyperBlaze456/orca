import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  diffTriviumSnapshots,
  readTriviumSnapshot,
  snapshotTriviumModel,
  type TriviumChange,
  type TriviumRemovedItem,
  type TriviumSnapshot
} from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { readTriviumPageStorage, writeTriviumPageStorage } from './trivium-page-storage'

export type TriviumChangeMarkers = {
  changes: ReadonlyMap<string, TriviumChange>
  removed: readonly TriviumRemovedItem[]
  newCount: number
  changedCount: number
  /** Stores the current model as the new baseline and clears every marker. */
  markSeen: () => void
}

type Opened = { snapshot: TriviumSnapshot | null }

function changesStorageKey(storageKey: string): string {
  return `${storageKey}:changes`
}

function storeBaseline(
  storageKey: string | null,
  model: TriviumModel | null
): TriviumSnapshot | null {
  if (!model) {
    return null
  }
  const snapshot = snapshotTriviumModel(model, Date.now())
  if (storageKey) {
    writeTriviumPageStorage(changesStorageKey(storageKey), snapshot)
  }
  return snapshot
}

/**
 * "Since your last visit" markers against the baseline read when the page opened (once per
 * storage key), so a StrictMode remount, which stores the snapshot, does not erase them.
 * Leaving the page or switching workspace stores the snapshot the user last saw.
 */
export function useTriviumChangeMarkers(
  storageKey: string | null,
  model: TriviumModel | null
): TriviumChangeMarkers {
  const opened = useMemo<Opened>(
    () => ({
      snapshot: storageKey
        ? readTriviumSnapshot(readTriviumPageStorage(changesStorageKey(storageKey)))
        : null
    }),
    [storageKey]
  )
  // A "Mark as seen" belongs to the visit it happened in.
  const [marked, setMarked] = useState<{ opened: Opened; snapshot: TriviumSnapshot } | null>(null)
  const baseline = marked?.opened === opened ? marked.snapshot : opened.snapshot
  const seen = useRef({ storageKey, model })

  useEffect(() => {
    const held = seen.current
    if (held.storageKey !== storageKey) {
      storeBaseline(held.storageKey, held.model)
      held.storageKey = storageKey
      held.model = model
    } else if (model) {
      // A reload that briefly drops the model does not forget what the user saw.
      held.model = model
    }
  })
  useEffect(() => {
    const held = seen.current
    return () => {
      storeBaseline(held.storageKey, held.model)
    }
  }, [])

  const markSeen = useCallback(() => {
    const snapshot = storeBaseline(storageKey, model)
    if (snapshot) {
      setMarked({ opened, snapshot })
    }
  }, [model, opened, storageKey])

  return useMemo(() => {
    const { changes, removed } = model
      ? diffTriviumSnapshots(baseline, snapshotTriviumModel(model, 0))
      : { changes: new Map<string, TriviumChange>(), removed: [] }
    let newCount = 0
    for (const change of changes.values()) {
      newCount += change.kind === 'new' ? 1 : 0
    }
    return { changes, removed, newCount, changedCount: changes.size - newCount, markSeen }
  }, [baseline, markSeen, model])
}
