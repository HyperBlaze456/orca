import { useCallback, useMemo, useState } from 'react'
import { WrapText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumChange } from './trivium-change-markers'
import {
  layoutTriviumLanes,
  placeTriviumDependencyEdges,
  reservedTriviumLanes,
  triviumDependencyEdges,
  triviumLaneWidth
} from './trivium-dependency-lane'
import type { TriviumModel } from './trivium-goal-model'
import {
  triviumCanonicalKey,
  triviumKeyAncestors,
  type TriviumTreeEntry
} from './trivium-goal-tree'
import { TriviumGoalTree } from './TriviumGoalTree'
import { TriviumStructureNav } from './TriviumStructureNav'
import {
  buildTriviumTreeRows,
  triviumTreeFilter,
  triviumTreeItemMatches
} from './trivium-tree-rows'
import type { TriviumNavigation } from './use-trivium-navigation'

export type TriviumStructurePaneProps = {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  /** Change markers by id (`useTriviumChangeMarkers(...).changes`). */
  changes: ReadonlyMap<string, TriviumChange>
  needsYouCount: number
  /** Active tickets (`model.ticketIds.length`). */
  ticketCount: number
}

function footLine(rows: number, arrows: number, showAll: boolean): string {
  if (rows === 0) {
    return ''
  }
  if (arrows > 0) {
    return translate(
      'trivium.dependency.explain',
      'Arrows point from a ticket to what it depends on.'
    )
  }
  return showAll
    ? translate('trivium.dependency.none', 'No dependencies between the rows shown.')
    : translate('trivium.dependency.hint', 'Select or hover a ticket to see its dependencies.')
}

/**
 * The left pane: view rows, then the Goal outline drawn as a tree with its filter and the
 * depends-on lane. It fills its container; the page owns its width.
 */
export function TriviumStructurePane({
  model,
  entries,
  navigation,
  changes,
  needsYouCount,
  ticketCount
}: TriviumStructurePaneProps): React.JSX.Element {
  const [filterText, setFilterText] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const filter = useMemo(() => triviumTreeFilter(filterText), [filterText])
  const rows = useMemo(
    () =>
      buildTriviumTreeRows(entries, {
        expanded: navigation.expanded,
        filter,
        matches: (id) => (filter ? triviumTreeItemMatches(model, id, filter) : true)
      }),
    [entries, filter, model, navigation.expanded]
  )
  const dependencies = useMemo(() => triviumDependencyEdges(model), [model])
  const placed = useMemo(
    () => placeTriviumDependencyEdges(rows, dependencies, (id) => triviumCanonicalKey(model, id)),
    [dependencies, model, rows]
  )
  const selectedId = navigation.route.view === 'item' ? navigation.route.id : null
  const laneEdges = useMemo(() => {
    const focus = new Set([hoveredId, selectedId].filter((id): id is string => id !== null))
    return layoutTriviumLanes(placed, focus, showAll)
  }, [hoveredId, placed, selectedId, showAll])
  const laneWidth = useMemo(
    () => triviumLaneWidth(reservedTriviumLanes(placed, rows, selectedId, showAll)),
    [placed, rows, selectedId, showAll]
  )

  const { expanded, selectedKey, toggle } = navigation
  const changeFilter = useCallback(
    (next: string) => {
      // Clearing the filter restores the saved expansion; keep the selected row in sight.
      if (!next.trim() && filterText.trim() && selectedKey) {
        for (const key of triviumKeyAncestors(selectedKey)) {
          if (!expanded.has(key)) {
            toggle(key, true)
          }
        }
      }
      setFilterText(next)
    },
    [expanded, filterText, selectedKey, toggle]
  )

  const showAllLabel = translate('trivium.structure.showAllDependencies', 'Show every dependency')
  return (
    <section
      aria-label={translate('trivium.structure.label', 'Goal structure')}
      className="flex h-full min-h-0 flex-col"
    >
      <TriviumStructureNav
        navigation={navigation}
        needsYouCount={needsYouCount}
        ticketCount={ticketCount}
      />
      <div className="flex shrink-0 items-center gap-2 pt-3.5 pr-2.5 pb-1.5 pl-5">
        <span className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {translate('trivium.structure.goals', 'Goals')}
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <Input
            type="search"
            value={filterText}
            onChange={(event) => changeFilter(event.target.value)}
            placeholder={translate('trivium.structure.filter', 'Filter')}
            aria-label={translate('trivium.structure.filterLabel', 'Filter goals and tickets')}
            className="h-7 w-36 min-w-0"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={showAll}
                onPressedChange={setShowAll}
                aria-label={showAllLabel}
                className="size-7 min-w-7"
              >
                <WrapText
                  aria-hidden="true"
                  className={cn('size-3.5', !showAll && 'text-muted-foreground')}
                />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {showAllLabel}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <TriviumGoalTree
        model={model}
        rows={rows}
        filter={filter}
        navigation={navigation}
        changes={changes}
        laneEdges={laneEdges}
        laneWidth={laneWidth}
        onHover={setHoveredId}
      />
      <p
        data-trivium-dependency-foot=""
        className="min-h-7 shrink-0 border-t border-border px-5 pt-1.5 pb-2.5 text-[11px] leading-4 text-muted-foreground"
      >
        {footLine(rows.length, laneEdges.length, showAll)}
      </p>
    </section>
  )
}
