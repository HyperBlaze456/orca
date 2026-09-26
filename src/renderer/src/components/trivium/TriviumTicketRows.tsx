import { useState } from 'react'
import { ChevronRight, Link2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { describeTriviumChange, type TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumIdSlug } from './trivium-harness-text'
import { triviumWorkLoadState, type TriviumReaderLoadState } from './trivium-reader-load'
import { formatTriviumCount } from './trivium-reader-text'
import { triviumTicketKindLabel } from './trivium-ticket-kinds'
import { groupTriviumTickets, type TriviumTicketGroup } from './trivium-ticket-list-groups'
import type {
  TriviumTicketListGrouping,
  TriviumTicketListProperties
} from './trivium-ticket-list-options'
import { TriviumChangeDot } from './TriviumChangeDot'
import { TriviumTicketGroupIcon, TriviumTicketStatusIcon } from './TriviumIcons'
import {
  TriviumReaderCommitPill,
  TriviumReaderPill,
  TriviumReaderPillText
} from './TriviumReaderPill'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumRichText } from './TriviumRichText'

export type TriviumTicketRowsProps = {
  /** Test hook naming the list ("all", "goal", "depends-on"…). */
  name: string
  model: TriviumModel
  /** Already filtered and ordered. */
  ids: readonly string[]
  grouping: TriviumTicketListGrouping
  treeOrder: ReadonlyMap<string, number>
  properties: TriviumTicketListProperties
  changes: ReadonlyMap<string, TriviumChange>
  /** Relation rows show before ticket records load; their states and rings wait for them. */
  loadState: TriviumReaderLoadState
  /** The last ticket the user opened; its row is highlighted. */
  currentId: string | null
  onOpen: (id: string) => void
}

function GoalRing({
  model,
  id,
  loadState,
  size,
  dashed
}: {
  model: TriviumModel
  id: string
  loadState: TriviumReaderLoadState
  size?: number
  dashed?: boolean
}): React.JSX.Element | null {
  const work = model.work(id)
  return (
    <TriviumReaderWorkRing
      state={triviumWorkLoadState(loadState, work)}
      size={size}
      fraction={work.fraction}
      dashed={dashed}
    />
  )
}

function groupLabel(model: TriviumModel, group: TriviumTicketGroup): string {
  switch (group.kind) {
    case 'status':
      return triviumTicketKindLabel(group.status)
    case 'goal':
      return group.goalId === null
        ? translate('trivium.ticketList.noParent', 'No parent goal')
        : model.title(group.goalId)
    case 'all':
      return ''
  }
}

function GroupIcon({
  model,
  group,
  loadState
}: {
  model: TriviumModel
  group: TriviumTicketGroup
  loadState: TriviumReaderLoadState
}) {
  if (group.kind === 'status') {
    return <TriviumTicketStatusIcon kind={group.status} />
  }
  if (group.kind === 'goal' && group.goalId !== null) {
    return (
      <GoalRing
        model={model}
        id={group.goalId}
        loadState={loadState}
        dashed={model.node(group.goalId)?.status !== 'adopted'}
      />
    )
  }
  return <TriviumTicketGroupIcon />
}

function RowPills({
  model,
  id,
  properties,
  loadState
}: {
  model: TriviumModel
  id: string
  properties: TriviumTicketListProperties
  loadState: TriviumReaderLoadState
}): React.JSX.Element {
  // Without ticket records every dependency would read as not done.
  const waiting =
    loadState.tickets !== 'ready' || model.ticketKind(id) === 'done' ? [] : model.waitingOn(id)
  const parent = model.parent(id)
  const commit = model.ticketCommit(id)
  return (
    <span className="flex max-w-[48%] min-w-0 shrink-0 items-center justify-end gap-1.5">
      {waiting.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span data-trivium-waiting={waiting.length} className="inline-flex min-w-0">
              <TriviumReaderPill size="sm" tone="blocked">
                <Link2 aria-hidden="true" className="size-3 shrink-0" />
                <TriviumReaderPillText>
                  {translate('trivium.ticketList.waitingOn', 'Waiting on {{n}}', {
                    n: formatTriviumCount(waiting.length)
                  })}
                </TriviumReaderPillText>
              </TriviumReaderPill>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4} className="max-w-96">
            {waiting.map((item) => model.title(item)).join(' · ')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {properties.goal && parent ? (
        <TriviumReaderPill size="sm" className="max-w-[180px] @max-[720px]/reader:hidden">
          <GoalRing model={model} id={parent} loadState={loadState} size={12} />
          <TriviumReaderPillText>
            <TriviumRichText inline text={model.title(parent)} />
          </TriviumReaderPillText>
        </TriviumReaderPill>
      ) : null}
      {properties.commit && commit ? <TriviumReaderCommitPill commit={commit} /> : null}
    </span>
  )
}

function TicketRow({
  model,
  id,
  properties,
  change,
  loadState,
  current,
  onOpen
}: {
  model: TriviumModel
  id: string
  properties: TriviumTicketListProperties
  change: TriviumChange | undefined
  loadState: TriviumReaderLoadState
  current: boolean
  onOpen: (id: string) => void
}): React.JSX.Element {
  const isTicket = model.isTicket(id)
  const kind = model.ticketKind(id)
  const title = model.title(id)
  return (
    <li>
      <button
        type="button"
        data-trivium-ticket-row={id}
        data-current={current ? 'true' : undefined}
        aria-current={current ? 'true' : undefined}
        onClick={() => onOpen(id)}
        className="flex h-9 w-full min-w-0 items-center gap-2.5 border-b border-border pr-2.5 pl-1.5 text-left text-[13px] hover:bg-trivium-row-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset data-[current=true]:bg-trivium-row-selected"
      >
        <span className="flex w-1.75 shrink-0 justify-center">
          {change ? (
            <TriviumChangeDot
              kind={change.kind}
              description={
                change.kind === 'changed' ? describeTriviumChange(change, model.title) : undefined
              }
            />
          ) : null}
        </span>
        {properties.id ? (
          <span className="w-[172px] shrink-0 truncate font-mono text-[11.5px] text-muted-foreground @max-[720px]/reader:hidden">
            {triviumIdSlug(id)}
          </span>
        ) : null}
        {!isTicket ? (
          <GoalRing model={model} id={id} loadState={loadState} />
        ) : loadState.tickets === 'ready' ? (
          <TriviumTicketStatusIcon kind={kind} label={triviumTicketKindLabel(kind)} />
        ) : (
          // Unknown until ticket records load: an "Open" icon would read as not done.
          <span aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate">
              <TriviumRichText inline text={title} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4} className="max-w-96">
            {title}
          </TooltipContent>
        </Tooltip>
        {isTicket ? (
          <RowPills model={model} id={id} properties={properties} loadState={loadState} />
        ) : null}
      </button>
    </li>
  )
}

/**
 * Linear's list: collapsible 36px band headers in list order and 36px rows (change dot, ID,
 * status icon, title, then the waiting, goal and commit pills). No column header row.
 */
export function TriviumTicketRows({
  name,
  model,
  ids,
  grouping,
  treeOrder,
  properties,
  changes,
  loadState,
  currentId,
  onOpen
}: TriviumTicketRowsProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const groups = groupTriviumTickets(model, ids, grouping, treeOrder)
  const toggle = (key: string): void =>
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  return (
    <div data-trivium-ticket-rows={name}>
      {groups.map((group) => {
        const open = !collapsed.has(group.key)
        return (
          <div key={group.key} data-trivium-group={group.key} className="mb-2 last:mb-0">
            {group.kind === 'all' ? null : (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(group.key)}
                className="group flex h-9 w-full min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 text-left text-[13px] font-medium hover:bg-trivium-row-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronRight
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none"
                />
                <GroupIcon model={model} group={group} loadState={loadState} />
                <span className="min-w-0 truncate">
                  <TriviumRichText inline text={groupLabel(model, group)} />
                </span>
                <span className="font-normal text-muted-foreground tabular-nums">
                  {formatTriviumCount(group.ids.length)}
                </span>
              </button>
            )}
            {open ? (
              <ul>
                {group.ids.map((id) => (
                  <TicketRow
                    key={id}
                    model={model}
                    id={id}
                    properties={properties}
                    change={changes.get(id)}
                    loadState={loadState}
                    current={id === currentId}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
