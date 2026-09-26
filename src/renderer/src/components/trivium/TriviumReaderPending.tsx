import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumLoadState, TriviumReaderNeed } from './trivium-reader-load'

/** A quiet placeholder bar for one value that is still loading. */
export function TriviumReaderSkeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-trivium-skeleton=""
      className={cn('inline-block h-3 w-20 animate-pulse rounded bg-muted/70', className)}
    />
  )
}

function failureText(need: TriviumReaderNeed): string {
  return need === 'tickets'
    ? translate('trivium.reader.ticketsFailed', "Couldn't load tickets.")
    : translate('trivium.reader.progressFailed', "Couldn't load progress details.")
}

function loadingText(need: TriviumReaderNeed): string {
  return need === 'tickets'
    ? translate('trivium.reader.ticketsLoading', 'Loading tickets…')
    : translate('trivium.reader.progressLoading', 'Loading progress details…')
}

/**
 * Stands in for a block that reads tickets or progress: a skeleton line while loading, the
 * failure with Retry after an error, nothing once ready.
 */
export function TriviumReaderPending({
  state,
  need,
  onRetry
}: {
  state: TriviumLoadState
  need: TriviumReaderNeed
  onRetry: () => void
}): React.JSX.Element | null {
  if (state === 'ready') {
    return null
  }
  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-label={loadingText(need)}
        data-trivium-pending="loading"
        className="py-2"
      >
        <TriviumReaderSkeleton className="block w-2/5 max-w-60" />
      </div>
    )
  }
  return (
    <div
      data-trivium-pending="error"
      className="flex flex-wrap items-center gap-2 py-1 text-[13px] text-muted-foreground"
    >
      <span>{failureText(need)}</span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        {translate('trivium.reader.retry', 'Retry')}
      </Button>
    </div>
  )
}
