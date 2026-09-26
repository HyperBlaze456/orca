import { useMemo } from 'react'
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTreeOrder, type TriviumTreeEntry } from './trivium-goal-tree'
import { triviumNeedState, type TriviumReaderLoadState } from './trivium-reader-load'
import { formatTriviumCount } from './trivium-reader-text'
import { TriviumApprovalCallout } from './TriviumApprovalCallout'
import { TriviumReaderBreadcrumb } from './TriviumReaderBreadcrumb'
import { TriviumReaderPending } from './TriviumReaderPending'
import { TriviumReaderSection } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'
import { TriviumTicketPageDelivered } from './TriviumTicketPageDelivered'
import { TriviumTicketPageRail } from './TriviumTicketPageRail'
import { TriviumTicketRows } from './TriviumTicketRows'
import type { TriviumNavigation } from './use-trivium-navigation'

const RELATION_PROPERTIES = { id: false, goal: false, commit: false } as const

function PagerButton({
  label,
  target,
  navigation,
  children
}: {
  label: string
  target: string | undefined
  navigation: TriviumNavigation
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            disabled={target === undefined}
            onClick={() => {
              if (target !== undefined) {
                navigation.openItem(target)
              }
            }}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** "8 / 10" over the tickets under the same parent, in the outline's order. */
function TicketPager({
  model,
  id,
  navigation
}: {
  model: TriviumModel
  id: string
  navigation: TriviumNavigation
}): React.JSX.Element | null {
  const parent = model.parent(id)
  const siblings = parent ? model.directTickets(parent) : model.unparentedTickets
  const index = siblings.indexOf(id)
  if (index === -1) {
    return null
  }
  return (
    <div
      data-trivium-pager=""
      className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
    >
      <span className="mr-1">
        {translate('trivium.ticketPage.position', '{{position}} / {{total}}', {
          position: formatTriviumCount(index + 1),
          total: formatTriviumCount(siblings.length)
        })}
      </span>
      <PagerButton
        label={translate('trivium.ticketPage.previous', 'Previous ticket')}
        target={index > 0 ? siblings[index - 1] : undefined}
        navigation={navigation}
      >
        <ChevronUp aria-hidden="true" className="size-3.5" />
      </PagerButton>
      <PagerButton
        label={translate('trivium.ticketPage.next', 'Next ticket')}
        target={index < siblings.length - 1 ? siblings[index + 1] : undefined}
        navigation={navigation}
      >
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </PagerButton>
    </div>
  )
}

function TicketFiles({ paths }: { paths: readonly string[] }): React.JSX.Element {
  return (
    <div data-trivium-section="files" className="mt-7">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
            />
            {translate('trivium.ticketPage.filesTouched', 'Files this ticket touches · {{n}}', {
              n: formatTriviumCount(paths.length)
            })}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2 font-mono text-xs leading-5 text-muted-foreground">
            {paths.map((path) => (
              <li key={path} className="break-all">
                {path}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/**
 * Linear's issue page for a G3 ticket: title, the approval callout for a proposed ticket,
 * the full description, what delivered it and its dependencies, beside a properties rail.
 */
export function TriviumTicketPage({
  model,
  id,
  entries,
  navigation,
  changes,
  loadState,
  onAskAgent
}: {
  model: TriviumModel
  id: string
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
  onAskAgent: (draft: string) => void
}): React.JSX.Element {
  const treeOrder = useMemo(() => triviumTreeOrder(entries), [entries])
  const statement = model.node(id)?.statement || model.ticket(id)?.statement || ''
  const ticketsState = triviumNeedState(loadState, ['tickets'])
  const paths = model.ticket(id)?.paths ?? []
  const relations = [
    {
      name: 'depends-on',
      title: translate('trivium.ticketPage.dependsOn', 'Depends on'),
      ids: model.dependsOn(id)
    },
    {
      name: 'required-by',
      title: translate('trivium.ticketPage.requiredBy', 'Required by'),
      ids: model.requiredBy(id)
    }
  ]
  return (
    <div data-trivium-page="ticket" data-trivium-item={id}>
      <div className="mb-4 flex min-h-6.5 items-center gap-2.5">
        <TriviumReaderBreadcrumb model={model} id={id} navigation={navigation} />
        <TicketPager model={model} id={id} navigation={navigation} />
      </div>
      <div className="grid grid-cols-1 items-start gap-8 @min-[820px]/reader:grid-cols-[minmax(0,1fr)_248px]">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-balance break-keep wrap-anywhere">
            <TriviumRichText inline text={model.title(id)} />
          </h2>
          {model.ticketKind(id) === 'approval' ? (
            <TriviumApprovalCallout model={model} id={id} onAskAgent={onAskAgent} />
          ) : null}
          {statement ? (
            <TriviumRichText text={statement} className="mt-4 max-w-[70ch] text-sm leading-[1.7]" />
          ) : (
            <p className="mt-4 text-[13px] text-muted-foreground">
              {translate('trivium.ticketPage.noDescription', 'No description recorded.')}
            </p>
          )}
          <TriviumTicketPageDelivered model={model} id={id} loadState={loadState} />
          {relations.map((relation) =>
            relation.ids.length > 0 ? (
              <TriviumReaderSection
                key={relation.name}
                name={relation.name}
                title={relation.title}
                count={relation.ids.length}
              >
                <TriviumTicketRows
                  name={relation.name}
                  model={model}
                  ids={relation.ids}
                  grouping="none"
                  treeOrder={treeOrder}
                  properties={RELATION_PROPERTIES}
                  changes={changes}
                  loadState={loadState}
                  currentId={null}
                  onOpen={(target) => navigation.openItem(target)}
                />
              </TriviumReaderSection>
            ) : null
          )}
          {ticketsState === 'ready' ? (
            paths.length > 0 ? (
              <TicketFiles paths={paths} />
            ) : null
          ) : (
            <div data-trivium-section="tickets-pending" className="mt-7">
              <TriviumReaderPending state={ticketsState} need="tickets" onRetry={loadState.retry} />
            </div>
          )}
        </div>
        <TriviumTicketPageRail
          model={model}
          id={id}
          navigation={navigation}
          changes={changes}
          loadState={loadState}
        />
      </div>
    </div>
  )
}
