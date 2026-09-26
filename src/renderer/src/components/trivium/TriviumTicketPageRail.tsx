import type { ReactNode } from 'react'
import { GitMerge } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { describeTriviumChange, type TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { shortTriviumSha, triviumIdSlug } from './trivium-harness-text'
import {
  triviumNeedState,
  triviumWorkLoadState,
  type TriviumReaderLoadState
} from './trivium-reader-load'
import { formatTriviumCount, triviumTicketCount } from './trivium-reader-text'
import { triviumTicketKindLabel } from './trivium-ticket-kinds'
import { TriviumTicketStatusIcon } from './TriviumIcons'
import { TriviumReaderCopyButton } from './TriviumReaderButtons'
import { TriviumReaderSkeleton } from './TriviumReaderPending'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumInlineCode, TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

// Why this shell: the rail cards of Orca's Linear issue workspace (linear-issue-workspace-sidebar).
function RailCard({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-xs"
    >
      <div className="flex h-10 items-center border-b border-border/50 px-4 text-sm font-medium text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  )
}

function Property({
  name,
  label,
  children
}: {
  name: string
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div data-trivium-property={name} className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">{children}</dd>
    </div>
  )
}

function noneValue(): React.JSX.Element {
  return (
    <span className="text-muted-foreground">{translate('trivium.ticketPage.none', 'None')}</span>
  )
}

function approvalValue(model: TriviumModel, id: string): ReactNode {
  if (model.ticketKind(id) === 'approval') {
    return (
      <>
        <TriviumTicketStatusIcon kind="approval" />
        <span className="truncate text-trivium-decision">
          {translate('trivium.ticketKind.approval', 'Needs approval')}
        </span>
      </>
    )
  }
  const status = model.node(id)?.status ?? model.ticket(id)?.status ?? null
  if (status === 'adopted') {
    return translate('trivium.ticketPage.adopted', 'Adopted')
  }
  return <span className="truncate">{status ?? '—'}</span>
}

/** Linear's issue sidebar: Properties, then Details with the id and a copy action. */
export function TriviumTicketPageRail({
  model,
  id,
  navigation,
  changes,
  loadState
}: {
  model: TriviumModel
  id: string
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
}): React.JSX.Element {
  const ticketsState = triviumNeedState(loadState, ['tickets'])
  const commitState = triviumNeedState(loadState, ['tickets', 'progress'])
  const workState = model.workState(id)
  const parent = model.parent(id)
  const commit = model.ticketCommit(id)
  const change = changes.get(id)
  const dependsOn = model.dependsOn(id).length
  const requiredBy = model.requiredBy(id).length
  const files = model.ticket(id)?.paths.length ?? 0
  return (
    <aside
      aria-label={translate('trivium.ticketPage.rail', 'Ticket properties')}
      className="flex min-w-0 flex-col gap-3 @min-[820px]/reader:sticky @min-[820px]/reader:top-4"
    >
      <RailCard title={translate('trivium.ticketPage.properties', 'Properties')}>
        <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-2.5 px-3.5 py-3 text-[12.5px] leading-[18px]">
          <Property name="status" label={translate('trivium.reader.status', 'Status')}>
            {ticketsState === 'ready' ? (
              <>
                <TriviumTicketStatusIcon kind={workState} />
                <span className="truncate">{triviumTicketKindLabel(workState)}</span>
              </>
            ) : ticketsState === 'loading' ? (
              <TriviumReaderSkeleton />
            ) : (
              '—'
            )}
          </Property>
          <Property name="approval" label={translate('trivium.ticketPage.approval', 'Approval')}>
            {approvalValue(model, id)}
          </Property>
          <Property name="goal" label={translate('trivium.ticketPage.goal', 'Goal')}>
            {parent ? (
              <>
                <TriviumReaderWorkRing
                  state={triviumWorkLoadState(loadState, model.work(parent))}
                  fraction={model.work(parent).fraction}
                  dashed={model.node(parent)?.status !== 'adopted'}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => navigation.openItem(parent)}
                      className="min-w-0 truncate rounded-sm text-left underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <TriviumRichText inline text={model.title(parent)} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={6} className="max-w-80">
                    {model.title(parent)}
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              '—'
            )}
          </Property>
          <Property name="merged" label={translate('trivium.ticketPage.merged', 'Merged')}>
            {commit ? (
              <>
                <GitMerge aria-hidden="true" className="size-3.5 shrink-0 text-trivium-done" />
                <TriviumInlineCode>{shortTriviumSha(commit)}</TriviumInlineCode>
              </>
            ) : commitState === 'loading' ? (
              <TriviumReaderSkeleton />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Property>
          <Property
            name="depends-on"
            label={translate('trivium.ticketPage.dependsOn', 'Depends on')}
          >
            {dependsOn > 0 ? triviumTicketCount(dependsOn) : noneValue()}
          </Property>
          <Property
            name="required-by"
            label={translate('trivium.ticketPage.requiredBy', 'Required by')}
          >
            {requiredBy > 0 ? triviumTicketCount(requiredBy) : noneValue()}
          </Property>
          {change ? (
            <Property name="change" label={translate('trivium.ticketPage.change', 'Change')}>
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block size-1.75 shrink-0 rounded-full',
                  change.kind === 'new' ? 'bg-trivium-new' : 'border-[1.5px] border-trivium-new'
                )}
              />
              <span className="truncate text-trivium-new">
                {describeTriviumChange(change, model.title)}
              </span>
            </Property>
          ) : null}
        </dl>
      </RailCard>
      <RailCard title={translate('trivium.ticketPage.details', 'Details')}>
        <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-2.5 px-3.5 py-3 text-[12.5px] leading-[18px]">
          <Property name="id" label={translate('trivium.reader.id', 'ID')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0">
                  <TriviumInlineCode className="block truncate">
                    {triviumIdSlug(id)}
                  </TriviumInlineCode>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={6}>
                {id}
              </TooltipContent>
            </Tooltip>
          </Property>
          <Property name="files" label={translate('trivium.ticketPage.files', 'Files')}>
            {ticketsState === 'ready' ? (
              formatTriviumCount(files)
            ) : ticketsState === 'loading' ? (
              <TriviumReaderSkeleton />
            ) : (
              '—'
            )}
          </Property>
        </dl>
        <div className="px-1.5 pb-1.5">
          <TriviumReaderCopyButton
            text={id}
            label={translate('trivium.ticketPage.copyId', 'Copy ID')}
          />
        </div>
      </RailCard>
    </aside>
  )
}
