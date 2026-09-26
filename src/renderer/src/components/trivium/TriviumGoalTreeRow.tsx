import { memo, useId, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { describeTriviumChange, type TriviumChange } from './trivium-change-markers'
import { TriviumChangeDot } from './TriviumChangeDot'
import type { TriviumModel } from './trivium-goal-model'
import {
  keepTriviumRowFocus,
  TriviumGoalTreeGoalContent,
  TriviumGoalTreeGroupContent,
  TriviumGoalTreeTicketContent
} from './TriviumGoalTreeRowContent'
import {
  TriviumProgressRing,
  TriviumTicketGroupIcon,
  TriviumTicketStatusIcon
} from './TriviumIcons'
import type { TriviumTreeColumn, TriviumTreeGutter } from './trivium-tree-connectors'
import {
  triviumTreeRowAriaExpanded,
  type TriviumTreeFilter,
  type TriviumTreeRow
} from './trivium-tree-rows'

export type TriviumGoalTreeRowProps = {
  row: TriviumTreeRow
  gutter: TriviumTreeGutter
  model: TriviumModel
  filter: TriviumTreeFilter | null
  changes: ReadonlyMap<string, TriviumChange>
  selected: boolean
  /** Holds the tree's single tab stop. */
  tabStop: boolean
  laneWidth: number
  onSelect: (row: TriviumTreeRow) => void
  onToggle: (row: TriviumTreeRow) => void
  onHover: (id: string | null) => void
}

const LINE = 'bg-trivium-line'
const STRONG_LINE = 'bg-trivium-line-strong'
// Centered on the first text line (row min-height 32px), over the middle of the 20px column.
const GLYPH =
  'absolute top-4 left-2.5 grid size-5.5 -translate-x-1/2 -translate-y-1/2 place-items-center'

function TriviumGoalTreeColumn({ column }: { column: TriviumTreeColumn }): React.JSX.Element {
  if (column.kind === 'blank') {
    return <span className="w-5 shrink-0" />
  }
  if (column.kind === 'guide') {
    return (
      <span className="relative w-5 shrink-0">
        <span
          className={cn('absolute inset-y-0 left-[9.5px] w-px', column.strong ? STRONG_LINE : LINE)}
        />
      </span>
    )
  }
  return (
    <span className="relative w-5 shrink-0" data-elbow={column.joint}>
      <span
        className={cn(
          'absolute top-0 left-[9.5px] h-4 w-px',
          column.strong === 'none' ? LINE : STRONG_LINE
        )}
      />
      <span
        className={cn(
          'absolute top-[15.5px] left-[9.5px] h-px w-3.5',
          column.strong === 'path' ? STRONG_LINE : LINE
        )}
      />
      {column.joint === 'mid' ? (
        <span
          className={cn(
            'absolute top-4 bottom-0 left-[9.5px] w-px',
            column.strong === 'through' ? STRONG_LINE : LINE
          )}
        />
      ) : null}
    </span>
  )
}

function glyphIcon(row: TriviumTreeRow, model: TriviumModel): ReactNode {
  switch (row.entry.kind) {
    case 'goal':
      return (
        <TriviumProgressRing
          size={15}
          fraction={model.work(row.id).fraction}
          dashed={model.node(row.id)?.status !== 'adopted'}
        />
      )
    case 'group':
      return <TriviumTicketGroupIcon />
    case 'ticket':
      return <TriviumTicketStatusIcon kind={model.ticketKind(row.id)} />
  }
}

/** The ring, group icon or status icon; on a row that opens it is the expand button. */
function TriviumGoalTreeGlyph({
  row,
  model,
  onToggle
}: {
  row: TriviumTreeRow
  model: TriviumModel
  onToggle: (row: TriviumTreeRow) => void
}): React.JSX.Element {
  const icon = glyphIcon(row, model)
  if (!row.toggleable) {
    return <span className={GLYPH}>{icon}</span>
  }
  const label = row.expanded
    ? translate('trivium.tree.collapse', 'Collapse')
    : translate('trivium.tree.expand', 'Expand')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={label}
          onMouseDown={keepTriviumRowFocus}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(row)
          }}
          className={cn(GLYPH, 'rounded-full hover:bg-foreground/10')}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function TriviumGoalTreeRowView({
  row,
  gutter,
  model,
  filter,
  changes,
  selected,
  tabStop,
  laneWidth,
  onSelect,
  onToggle,
  onHover
}: TriviumGoalTreeRowProps): React.JSX.Element {
  const labelId = useId()
  const statusId = useId()
  const { entry } = row
  const change = entry.kind === 'group' ? undefined : changes.get(row.id)
  const tier =
    entry.kind === 'goal'
      ? (model.node(row.id)?.tier ?? '').toUpperCase()
      : entry.kind === 'group'
        ? 'G3'
        : ''
  const content = { row, model, filter, changes, labelId, onToggle }
  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
      aria-posinset={row.position}
      aria-setsize={row.siblings}
      aria-expanded={triviumTreeRowAriaExpanded(row)}
      aria-selected={selected}
      aria-labelledby={labelId}
      aria-describedby={entry.kind === 'ticket' ? statusId : undefined}
      tabIndex={tabStop ? 0 : -1}
      data-key={row.key}
      data-kind={entry.kind}
      data-dimmed={row.dimmed ? 'true' : undefined}
      data-current={selected ? 'true' : undefined}
      onClick={() => onSelect(row)}
      onMouseEnter={() => onHover(entry.kind === 'group' ? null : row.id)}
      className={cn(
        'relative flex min-h-8 items-stretch outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
        selected ? 'bg-trivium-row-selected' : 'hover:bg-trivium-row-hover'
      )}
    >
      <div className="flex shrink-0 pl-2.5">
        {gutter.columns.map((column) => (
          <TriviumGoalTreeColumn key={column.ancestorKey} column={column} />
        ))}
        <div className="relative w-5 shrink-0">
          {gutter.down === 'none' ? null : (
            <span
              className={cn(
                'absolute top-[23px] bottom-0 left-[9.5px] w-px',
                gutter.down === 'strong' ? STRONG_LINE : LINE
              )}
            />
          )}
          <TriviumGoalTreeGlyph row={row} model={model} onToggle={onToggle} />
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5 pr-2 pl-1.5">
        {entry.kind === 'goal' ? <TriviumGoalTreeGoalContent {...content} /> : null}
        {entry.kind === 'group' ? <TriviumGoalTreeGroupContent {...content} group={entry} /> : null}
        {entry.kind === 'ticket' ? (
          <TriviumGoalTreeTicketContent {...content} statusId={statusId} />
        ) : null}
      </div>
      <div className="flex h-8 w-3.5 shrink-0 items-center justify-center self-start">
        {change ? (
          <TriviumChangeDot
            kind={change.kind}
            description={
              change.kind === 'changed' ? describeTriviumChange(change, model.title) : undefined
            }
          />
        ) : null}
      </div>
      <div
        aria-hidden="true"
        data-trivium-lane=""
        className="shrink-0"
        style={{ width: laneWidth }}
      />
      <div className="w-[34px] shrink-0 pt-2 pr-3 text-right text-[11px] leading-4 text-muted-foreground tabular-nums">
        {tier}
      </div>
    </div>
  )
}

/** One outline row: gutter connectors, glyph, text, change dot, lane room and tier. */
export const TriviumGoalTreeRow = memo(TriviumGoalTreeRowView)
