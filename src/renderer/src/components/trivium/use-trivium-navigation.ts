import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TriviumModel } from './trivium-goal-model'
import {
  triviumCanonicalKey,
  triviumDefaultExpandedKeys,
  triviumKeyAncestors,
  type TriviumTreeEntry
} from './trivium-goal-tree'
import { readTriviumPageStorage, writeTriviumPageStorage } from './trivium-page-storage'

export type TriviumRouteAnchor = 'updates' | null

export type TriviumRoute =
  | { view: 'overview' }
  | { view: 'tickets'; parentId: string | null }
  | { view: 'item'; id: string; anchor: TriviumRouteAnchor }

export type TriviumNavigation = {
  route: TriviumRoute
  /** The selected tree row key, or null when a nav row or the list owns the reader. */
  selectedKey: string | null
  expanded: ReadonlySet<string>
  openOverview: () => void
  openTickets: (parentId: string | null) => void
  /** Opens a Goal or ticket, selects its canonical row and expands the rows above it. */
  openItem: (id: string, anchor?: TriviumRouteAnchor) => void
  /** A tree row click: a ticket group opens its parent-filtered ticket list. */
  selectEntry: (entry: TriviumTreeEntry) => void
  toggle: (key: string, open?: boolean) => void
}

export type TriviumNavigationOptions = {
  /** `triviumPageStorageKey(...)`; null keeps expansion in memory only. */
  storageKey: string | null
  model: TriviumModel | null
  entries: readonly TriviumTreeEntry[]
}

type NavigationState = {
  storageKey: string | null
  route: TriviumRoute
  selectedKey: string | null
  /** Null until the user changes expansion; the defaults of the current entries apply. */
  expanded: ReadonlySet<string> | null
}

function expandedStorageKey(storageKey: string): string {
  return `${storageKey}:expanded`
}

function readNavigationState(storageKey: string | null): NavigationState {
  const stored = storageKey ? readTriviumPageStorage(expandedStorageKey(storageKey)) : null
  return {
    storageKey,
    route: { view: 'overview' },
    selectedKey: null,
    expanded: Array.isArray(stored)
      ? new Set(stored.filter((key): key is string => typeof key === 'string'))
      : null
  }
}

export function useTriviumNavigation({
  storageKey,
  model,
  entries
}: TriviumNavigationOptions): TriviumNavigation {
  const [state, setState] = useState(() => readNavigationState(storageKey))
  // Another workspace starts from its own stored expansion and the Overview.
  const current = useMemo(
    () => (state.storageKey === storageKey ? state : readNavigationState(storageKey)),
    [state, storageKey]
  )
  const defaults = useMemo(() => triviumDefaultExpandedKeys(entries), [entries])
  const expanded = current.expanded ?? defaults

  useEffect(() => {
    if (current.storageKey && current.expanded) {
      writeTriviumPageStorage(expandedStorageKey(current.storageKey), [...current.expanded])
    }
  }, [current.storageKey, current.expanded])

  const update = useCallback(
    (change: (base: NavigationState) => NavigationState) =>
      setState((previous) =>
        change(previous.storageKey === current.storageKey ? previous : current)
      ),
    [current]
  )
  const openOverview = useCallback(
    () => update((base) => ({ ...base, route: { view: 'overview' }, selectedKey: null })),
    [update]
  )
  const openTickets = useCallback(
    (parentId: string | null) => {
      if (parentId !== null && !model?.node(parentId)) {
        return
      }
      update((base) => ({ ...base, route: { view: 'tickets', parentId }, selectedKey: null }))
    },
    [model, update]
  )
  const openItem = useCallback(
    (id: string, anchor: TriviumRouteAnchor = null) => {
      if (!model?.node(id)) {
        return
      }
      const key = triviumCanonicalKey(model, id)
      update((base) => {
        const open = base.expanded ?? defaults
        const missing = key ? triviumKeyAncestors(key).filter((item) => !open.has(item)) : []
        return {
          ...base,
          route: { view: 'item', id, anchor },
          selectedKey: key,
          expanded: missing.length > 0 ? new Set([...open, ...missing]) : base.expanded
        }
      })
    },
    [defaults, model, update]
  )
  const selectEntry = useCallback(
    (entry: TriviumTreeEntry) =>
      update((base) => ({
        ...base,
        selectedKey: entry.key,
        route:
          entry.kind === 'group'
            ? { view: 'tickets', parentId: entry.parentId }
            : { view: 'item', id: entry.id, anchor: null }
      })),
    [update]
  )
  const toggle = useCallback(
    (key: string, open?: boolean) =>
      update((base) => {
        const keys = base.expanded ?? defaults
        const want = open ?? !keys.has(key)
        if (want === keys.has(key)) {
          return base
        }
        const next = new Set(keys)
        if (want) {
          next.add(key)
        } else {
          next.delete(key)
        }
        return { ...base, expanded: next }
      }),
    [defaults, update]
  )

  return useMemo(
    () => ({
      route: current.route,
      selectedKey: current.selectedKey,
      expanded,
      openOverview,
      openTickets,
      openItem,
      selectEntry,
      toggle
    }),
    [current, expanded, openOverview, openTickets, openItem, selectEntry, toggle]
  )
}
