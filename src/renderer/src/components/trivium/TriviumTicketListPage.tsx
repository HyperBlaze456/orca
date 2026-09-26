import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTreeOrder, type TriviumTreeEntry } from './trivium-goal-tree'
import {
  triviumNeedState,
  triviumWorkLoadState,
  type TriviumReaderLoadState
} from './trivium-reader-load'
import { formatTriviumCount } from './trivium-reader-text'
import { filterTriviumTickets, sortTriviumTickets } from './trivium-ticket-list-groups'
import {
  loadTriviumTicketListOptions,
  saveTriviumTicketListOptions,
  type TriviumTicketListOptions
} from './trivium-ticket-list-options'
import { TriviumReaderPending } from './TriviumReaderPending'
import { TriviumReaderPill, TriviumReaderPillText } from './TriviumReaderPill'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumTicketDisplayMenu } from './TriviumTicketDisplayMenu'
import { TriviumTicketRows } from './TriviumTicketRows'
import type { TriviumNavigation } from './use-trivium-navigation'

function emptyText(sourceCount: number, parentId: string | null): string {
  if (sourceCount > 0) {
    return translate('trivium.ticketList.noMatches', 'No tickets match.')
  }
  return parentId
    ? translate('trivium.ticketList.noneUnderGoal', 'No tickets under this goal yet.')
    : translate('trivium.ticketList.none', 'No tickets yet.')
}

/** "All tickets" (or one Goal's tickets): a copy of Linear's list with its Display menu. */
export function TriviumTicketListPage({
  model,
  entries,
  navigation,
  changes,
  loadState,
  parentId,
  currentTicketId
}: {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
  parentId: string | null
  currentTicketId: string | null
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<TriviumTicketListOptions>(loadTriviumTicketListOptions)
  const treeOrder = useMemo(() => triviumTreeOrder(entries), [entries])
  const source = parentId ? model.descendantTickets(parentId) : model.ticketIds
  const visible = useMemo(
    () =>
      sortTriviumTickets(
        model,
        filterTriviumTickets(model, source, query, options.showDone),
        options.ordering,
        treeOrder
      ),
    [model, source, query, options.showDone, options.ordering, treeOrder]
  )
  const ticketsState = triviumNeedState(loadState, ['tickets'])
  const changeOptions = (next: TriviumTicketListOptions): void => {
    setOptions(next)
    saveTriviumTicketListOptions(next)
  }
  return (
    <div data-trivium-page="tickets">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h2 className="text-xl font-semibold">
          {parentId
            ? translate('trivium.ticketList.titleUnderGoal', 'Tickets')
            : translate('trivium.ticketList.title', 'All tickets')}
        </h2>
        <span data-trivium-ticket-count="" className="text-sm text-muted-foreground tabular-nums">
          {formatTriviumCount(visible.length)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('trivium.ticketList.search', 'Search tickets')}
            aria-label={translate('trivium.ticketList.search', 'Search tickets')}
            className="h-7 w-[220px] @max-[560px]/reader:w-36"
          />
          <TriviumTicketDisplayMenu options={options} onChange={changeOptions} />
        </div>
      </div>
      {parentId ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TriviumReaderPill name="parent-filter" className="pr-1">
            <TriviumReaderWorkRing
              state={triviumWorkLoadState(loadState, model.work(parentId))}
              size={12}
              fraction={model.work(parentId).fraction}
            />
            <TriviumReaderPillText>
              {translate('trivium.ticketList.under', 'Under {{goal}}', {
                goal: model.title(parentId)
              })}
            </TriviumReaderPillText>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={translate('trivium.ticketList.clearParent', 'Show all tickets')}
                  onClick={() => navigation.openTickets(null)}
                  className="grid size-4.5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate('trivium.ticketList.clearParent', 'Show all tickets')}
              </TooltipContent>
            </Tooltip>
          </TriviumReaderPill>
        </div>
      ) : null}
      <div className="mt-3.5">
        {ticketsState === 'ready' ? (
          visible.length > 0 ? (
            <TriviumTicketRows
              name="list"
              model={model}
              ids={visible}
              grouping={options.grouping}
              treeOrder={treeOrder}
              properties={options.properties}
              changes={changes}
              loadState={loadState}
              currentId={currentTicketId}
              onOpen={(id) => navigation.openItem(id)}
            />
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {emptyText(source.length, parentId)}
            </p>
          )
        ) : (
          <TriviumReaderPending state={ticketsState} need="tickets" onRetry={loadState.retry} />
        )}
      </div>
    </div>
  )
}
