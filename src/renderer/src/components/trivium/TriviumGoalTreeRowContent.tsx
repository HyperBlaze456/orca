import { Fragment, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import type { TriviumTicketGroupEntry } from './trivium-goal-tree'
import { TriviumTicketStatusIcon } from './TriviumIcons'
import {
  TRIVIUM_TICKET_LIST_ORDER,
  triviumTicketKindLabel,
  type TriviumTicketKind
} from './trivium-ticket-kinds'
import {
  splitTriviumTreeMatches,
  type TriviumTreeFilter,
  type TriviumTreeRow
} from './trivium-tree-rows'
import {
  countTriviumTreeChanges,
  triviumTreeChangedLabel,
  triviumTreeContentsLabel,
  triviumTreeGoalStatusLabel,
  triviumTreeNewLabel,
  triviumTreeTicketCount
} from './trivium-tree-text'

export type TriviumGoalTreeRowContentProps = {
  row: TriviumTreeRow
  model: TriviumModel
  filter: TriviumTreeFilter | null
  changes: ReadonlyMap<string, TriviumChange>
  /** Id for the row's accessible name (the title, or a group's ticket count). */
  labelId: string
  onToggle: (row: TriviumTreeRow) => void
}

const SUB_LINE = 'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4'

function isClamped(element: HTMLElement | null): boolean {
  return element !== null && element.scrollHeight > element.clientHeight + 1
}

/** Keeps focus on the row: the tree moves it there after a toggle. */
export function keepTriviumRowFocus(event: MouseEvent): void {
  event.preventDefault()
}

/** 13px title, two lines at most; the full title shows in a tooltip only when it is clamped. */
function TriviumGoalTreeTitle({
  id,
  text,
  filter,
  className
}: {
  id: string
  text: string
  filter: TriviumTreeFilter | null
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isClamped(ref.current))}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          id={id}
          className={cn('line-clamp-2 text-[13px] leading-5 break-keep wrap-anywhere', className)}
        >
          {splitTriviumTreeMatches(text, filter).map((segment) =>
            segment.match ? (
              <mark key={segment.offset} className="rounded-[2px] bg-trivium-new/20 text-inherit">
                {segment.text}
              </mark>
            ) : (
              <Fragment key={segment.offset}>{segment.text}</Fragment>
            )
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-80">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

/** A sub-line part that opens or closes the row; plain text while the filter fixes expansion. */
function TriviumGoalTreeSubToggle({
  row,
  labelId,
  onToggle,
  children
}: {
  row: TriviumTreeRow
  labelId?: string
  onToggle: (row: TriviumTreeRow) => void
  children: ReactNode
}): React.JSX.Element {
  if (!row.toggleable) {
    return <span id={labelId}>{children}</span>
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={keepTriviumRowFocus}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(row)
      }}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      <ChevronRight
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0 transition-transform motion-reduce:transition-none',
          row.expanded && 'rotate-90'
        )}
      />
      <span id={labelId}>{children}</span>
    </button>
  )
}

/** "3 new" / "1 changed" on a closed row whose contents changed since the last visit. */
function TriviumGoalTreeChangeCounts({
  ids,
  changes
}: {
  ids: readonly string[]
  changes: ReadonlyMap<string, TriviumChange>
}): React.JSX.Element | null {
  const { added, changed } = countTriviumTreeChanges(ids, changes)
  if (added === 0 && changed === 0) {
    return null
  }
  return (
    <>
      {added > 0 ? <span className="text-trivium-new">{triviumTreeNewLabel(added)}</span> : null}
      {changed > 0 ? (
        <span className="text-trivium-new">{triviumTreeChangedLabel(changed)}</span>
      ) : null}
    </>
  )
}

function TriviumTicketKindCounts({
  ids,
  model
}: {
  ids: readonly string[]
  model: TriviumModel
}): React.JSX.Element {
  const counts = new Map<TriviumTicketKind, number>()
  for (const id of ids) {
    const kind = model.ticketKind(id)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {TRIVIUM_TICKET_LIST_ORDER.filter((kind) => counts.has(kind)).map((kind) => (
        <Tooltip key={kind}>
          <TooltipTrigger asChild>
            <span
              data-trivium-kind-count={kind}
              className="inline-flex items-center gap-[3px] tabular-nums"
            >
              <TriviumTicketStatusIcon kind={kind} size={12} label={triviumTicketKindLabel(kind)} />
              {counts.get(kind)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {triviumTicketKindLabel(kind)}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}

export function TriviumGoalTreeGoalContent({
  row,
  model,
  filter,
  changes,
  labelId,
  onToggle
}: TriviumGoalTreeRowContentProps): React.JSX.Element {
  const node = model.node(row.id)
  const status = node && node.status !== 'adopted' ? node.status : null
  const closed = row.hasChildren && !row.expanded
  const goals = closed ? model.descendantGoals(row.id) : []
  const tickets = closed ? model.descendantTickets(row.id) : []
  return (
    <>
      <TriviumGoalTreeTitle
        id={labelId}
        text={model.title(row.id)}
        filter={filter}
        className={cn(
          node?.tier === 'g0' ? 'font-semibold' : 'font-medium',
          row.dimmed && 'opacity-50'
        )}
      />
      {status || closed ? (
        <div className={cn(SUB_LINE, 'text-muted-foreground')}>
          {status ? (
            <span className={status === 'candidate' ? 'text-trivium-decision' : undefined}>
              {triviumTreeGoalStatusLabel(status)}
            </span>
          ) : null}
          {closed ? (
            <TriviumGoalTreeSubToggle row={row} onToggle={onToggle}>
              {triviumTreeContentsLabel(goals.length, tickets.length)}
            </TriviumGoalTreeSubToggle>
          ) : null}
          {closed ? (
            <TriviumGoalTreeChangeCounts ids={[...goals, ...tickets]} changes={changes} />
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function TriviumGoalTreeGroupContent({
  row,
  group,
  model,
  changes,
  labelId,
  onToggle
}: TriviumGoalTreeRowContentProps & { group: TriviumTicketGroupEntry }): React.JSX.Element {
  return (
    <div className={cn(SUB_LINE, 'text-muted-foreground', row.dimmed && 'opacity-50')}>
      <TriviumGoalTreeSubToggle row={row} labelId={labelId} onToggle={onToggle}>
        {triviumTreeTicketCount(group.ticketIds.length)}
      </TriviumGoalTreeSubToggle>
      <TriviumTicketKindCounts ids={group.ticketIds} model={model} />
      {row.expanded ? null : (
        <TriviumGoalTreeChangeCounts ids={group.ticketIds} changes={changes} />
      )}
    </div>
  )
}

/** A ticket's title; "Needs approval" or "Blocked" shows under it, other states only to AT. */
export function TriviumGoalTreeTicketContent({
  row,
  model,
  filter,
  labelId,
  statusId
}: TriviumGoalTreeRowContentProps & { statusId: string }): React.JSX.Element {
  const kind = model.ticketKind(row.id)
  const finished = kind === 'done' || kind === 'abandoned'
  const noted = kind === 'approval' || kind === 'blocked'
  return (
    <>
      <TriviumGoalTreeTitle
        id={labelId}
        text={model.title(row.id)}
        filter={filter}
        className={cn(finished && 'text-muted-foreground', row.dimmed && 'opacity-50')}
      />
      <div
        id={statusId}
        className={cn(
          noted ? SUB_LINE : 'sr-only',
          kind === 'approval' && 'text-trivium-decision',
          kind === 'blocked' && 'text-trivium-blocked'
        )}
      >
        {triviumTicketKindLabel(kind)}
      </div>
    </>
  )
}
