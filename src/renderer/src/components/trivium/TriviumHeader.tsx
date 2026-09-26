import { useRef } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import type { TriviumWorkspaceState } from '../../../../shared/trivium-workspace-status'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TriviumPageFrame } from './trivium-page-data'
import { formatTriviumClockTime, type TriviumStaleNotice } from './trivium-page-load'
import { triviumStatePhrase } from './trivium-status-display'
import { TriviumChangesPopover } from './TriviumChangesPopover'
import { TriviumMilestoneDiamond } from './TriviumIcons'
import { TriviumInfoPopover } from './TriviumInfoPopover'

export type TriviumHeaderFrame = Pick<
  TriviumPageFrame,
  'model' | 'entries' | 'changes' | 'navigation' | 'loadState'
>

function TriviumHeaderState({ state }: { state: TriviumWorkspaceState }): React.JSX.Element {
  return (
    <span
      data-trivium-state={state}
      className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground"
    >
      {state === 'review' ? <TriviumMilestoneDiamond review size={13} /> : null}
      <span className="truncate">{triviumStatePhrase(state)}</span>
    </span>
  )
}

/** Shown only while a failed read leaves older data on screen; never says anything ended. */
function TriviumHeaderStale({
  since,
  onRetry
}: {
  since: number | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div data-trivium-stale="" className="mr-1.5 flex min-w-0 items-center gap-1.5 text-xs">
      <CloudOff aria-hidden="true" className="size-3.5 shrink-0" />
      <span role="status" className="truncate">
        {since === null
          ? translate(
              'trivium.header.stale',
              "Can't reach Trivium. Showing the last data received."
            )
          : translate(
              'trivium.header.staleSince',
              "Can't reach Trivium. Showing data from {{time}}.",
              {
                time: formatTriviumClockTime(since)
              }
            )}
      </span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        {translate('trivium.header.retry', 'Retry')}
      </Button>
    </div>
  )
}

/**
 * The page's one 48px band: title, the workspace state in words, then freshness, the changes
 * chip, workspace details and Refresh. No back button: the sidebar leaves the page.
 */
export function TriviumHeader({
  state,
  stale,
  frame,
  onRefresh
}: {
  state: TriviumWorkspaceState | null
  stale: TriviumStaleNotice | null
  /** The model's controls (changes, details) once a harness answered. */
  frame: TriviumHeaderFrame | null
  onRefresh: () => void
}): React.JSX.Element {
  const refreshLabel = translate('trivium.header.refresh', 'Refresh')
  const refreshButton = useRef<HTMLButtonElement>(null)
  return (
    <header
      data-trivium-header=""
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border pl-5 pr-[max(0.625rem,var(--window-controls-width,0px))]"
    >
      <h1 className="shrink-0 text-base leading-8 font-semibold">
        {translate('trivium.header.title', 'Trivium')}
      </h1>
      {state ? <TriviumHeaderState state={state} /> : null}
      <div className="ml-auto flex min-w-0 items-center gap-1 text-muted-foreground">
        {stale ? <TriviumHeaderStale since={stale.since} onRetry={onRefresh} /> : null}
        {frame ? (
          <TriviumChangesPopover
            model={frame.model}
            entries={frame.entries}
            changes={frame.changes}
            navigation={frame.navigation}
            loadState={frame.loadState}
            onCleared={() => refreshButton.current?.focus()}
          />
        ) : null}
        {frame ? <TriviumInfoPopover model={frame.model} /> : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={refreshButton}
              variant="ghost"
              size="icon-xs"
              aria-label={refreshLabel}
              data-trivium-refresh=""
              onClick={onRefresh}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {refreshLabel}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
