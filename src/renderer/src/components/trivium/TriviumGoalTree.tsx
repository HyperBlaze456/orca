import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from 'react'
import { translate } from '@/i18n/i18n'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumLaneEdge } from './trivium-dependency-lane'
import type { TriviumModel } from './trivium-goal-model'
import { TriviumDependencyLane, type TriviumLanePositions } from './TriviumDependencyLane'
import { TriviumGoalTreeRow } from './TriviumGoalTreeRow'
import { buildTriviumTreeGutters } from './trivium-tree-connectors'
import {
  resolveTriviumTreeKey,
  TRIVIUM_TREE_KEYS,
  triviumTreeTabKey,
  type TriviumTreeFocus
} from './trivium-tree-keyboard'
import type { TriviumTreeFilter, TriviumTreeRow } from './trivium-tree-rows'
import type { TriviumNavigation } from './use-trivium-navigation'

export type TriviumGoalTreeProps = {
  model: TriviumModel
  rows: readonly TriviumTreeRow[]
  filter: TriviumTreeFilter | null
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  laneEdges: readonly TriviumLaneEdge[]
  laneWidth: number
  onHover: (id: string | null) => void
}

function rowElement(tree: HTMLElement | null, key: string): HTMLElement | null {
  for (const child of tree?.children ?? []) {
    if (child instanceof HTMLElement && child.dataset.key === key) {
      return child
    }
  }
  return null
}

function measureRows(tree: HTMLElement): TriviumLanePositions {
  const tops: number[] = []
  let laneLeft = 0
  for (const child of tree.children) {
    if (!(child instanceof HTMLElement)) {
      continue
    }
    if (tops.length === 0) {
      const lane = child.querySelector('[data-trivium-lane]')
      laneLeft = lane instanceof HTMLElement ? lane.offsetLeft : 0
    }
    tops.push(child.offsetTop)
  }
  return { tops, laneLeft }
}

function samePositions(a: TriviumLanePositions | null, b: TriviumLanePositions): boolean {
  return (
    a !== null &&
    a.laneLeft === b.laneLeft &&
    a.tops.length === b.tops.length &&
    a.tops.every((top, index) => top === b.tops[index])
  )
}

/** Row positions for the lane, re-measured after each layout change and on resize (wrapping). */
function useRowPositions(
  treeRef: RefObject<HTMLDivElement | null>,
  rows: readonly TriviumTreeRow[],
  laneWidth: number
): TriviumLanePositions | null {
  const [positions, setPositions] = useState<TriviumLanePositions | null>(null)
  useLayoutEffect(() => {
    const tree = treeRef.current
    if (!tree) {
      return undefined
    }
    const measure = (): void => {
      const next = measureRows(tree)
      setPositions((previous) => (samePositions(previous, next) ? previous : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(measure)
    observer.observe(tree)
    return () => observer.disconnect()
  }, [treeRef, rows, laneWidth])
  return positions
}

/** The Goal outline as a WAI-ARIA tree: one tab stop, arrow keys move and select. */
export function TriviumGoalTree({
  model,
  rows,
  filter,
  navigation,
  changes,
  laneEdges,
  laneWidth,
  onHover
}: TriviumGoalTreeProps): React.JSX.Element {
  const treeRef = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<TriviumTreeFocus | null>(null)
  const { selectedKey } = navigation
  const tabKey = triviumTreeTabKey(rows, focus, selectedKey)
  const gutters = useMemo(() => buildTriviumTreeGutters(rows, selectedKey), [rows, selectedKey])
  const positions = useRowPositions(treeRef, rows, laneWidth)

  const focusRow = useCallback((key: string) => {
    const element = rowElement(treeRef.current, key)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'nearest' })
  }, [])
  const select = useCallback(
    (row: TriviumTreeRow) => {
      if (row.key !== navigation.selectedKey) {
        navigation.selectEntry(row.entry)
      }
      setFocus({ key: row.key, selectedKey: row.key })
    },
    [navigation]
  )
  const toggle = useCallback(
    (row: TriviumTreeRow, open?: boolean) => {
      navigation.toggle(row.key, open)
      setFocus({ key: row.key, selectedKey: navigation.selectedKey })
    },
    [navigation]
  )
  const toggleFromPointer = useCallback(
    (row: TriviumTreeRow) => {
      toggle(row)
      // Keeps keyboard work on the toggled row; a first click from outside leaves focus alone
      // (Chromium would otherwise ring a script-focused row).
      if (treeRef.current?.contains(document.activeElement)) {
        focusRow(row.key)
      }
    },
    [focusRow, toggle]
  )

  // Opening an item from the reader or the header brings its row into view.
  useLayoutEffect(() => {
    if (selectedKey) {
      rowElement(treeRef.current, selectedKey)?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedKey])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || !TRIVIUM_TREE_KEYS.has(event.key)) {
      return
    }
    event.preventDefault()
    const target =
      event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
    const key = target instanceof HTMLElement ? target.dataset.key : tabKey
    const action = resolveTriviumTreeKey(
      rows,
      rows.findIndex((row) => row.key === key),
      event.key
    )
    const row = action ? rows[action.index] : undefined
    if (!action || !row) {
      return
    }
    if (action.kind === 'toggle') {
      toggle(row, action.open)
    } else {
      select(row)
      focusRow(row.key)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1">
        <p className="px-5 py-2 text-[13px] text-muted-foreground">
          {filter
            ? translate('trivium.structure.noMatches', 'No goals or tickets match.')
            : translate('trivium.structure.empty', 'No goals yet.')}
        </p>
      </div>
    )
  }
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
      <div className="relative pt-0.5 pb-3">
        <div
          ref={treeRef}
          role="tree"
          aria-label={translate('trivium.structure.tree', 'Goals and tickets')}
          onKeyDown={onKeyDown}
          onMouseLeave={() => onHover(null)}
        >
          {rows.map((row, index) => (
            <TriviumGoalTreeRow
              key={row.key}
              row={row}
              gutter={gutters[index]}
              model={model}
              filter={filter}
              changes={changes}
              selected={row.key === selectedKey}
              tabStop={row.key === tabKey}
              laneWidth={laneWidth}
              onSelect={select}
              onToggle={toggleFromPointer}
              onHover={onHover}
            />
          ))}
        </div>
        <TriviumDependencyLane edges={laneEdges} positions={positions} />
      </div>
    </div>
  )
}
