import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { describeTriviumChange, type TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTreeOrder, type TriviumTreeEntry } from './trivium-goal-tree'
import { triviumWorkLoadState, type TriviumDetailStates } from './trivium-reader-load'
import { formatTriviumCount } from './trivium-reader-text'
import { TriviumTicketStatusIcon } from './TriviumIcons'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumChangeMarkers } from './use-trivium-change-markers'
import type { TriviumNavigation } from './use-trivium-navigation'

/** "5 new · 1 changed · 2 removed", naming only the kinds that occurred. */
export function triviumChangesLabel(counts: {
  newCount: number
  changedCount: number
  removedCount: number
}): string {
  const parts: string[] = []
  if (counts.newCount > 0) {
    parts.push(
      translate('trivium.changes.new', '{{n}} new', {
        n: formatTriviumCount(counts.newCount)
      })
    )
  }
  if (counts.changedCount > 0) {
    parts.push(
      translate('trivium.changes.changed', '{{n}} changed', {
        n: formatTriviumCount(counts.changedCount)
      })
    )
  }
  if (counts.removedCount > 0) {
    parts.push(
      translate('trivium.changes.removed', '{{n}} removed', {
        n: formatTriviumCount(counts.removedCount)
      })
    )
  }
  return parts.join(' · ')
}

function ChangeMark({ kind }: { kind: TriviumChange['kind'] }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.75 shrink-0 rounded-full',
        kind === 'new' ? 'bg-trivium-new' : 'border-[1.5px] border-trivium-new'
      )}
    />
  )
}

function ItemGlyph({
  model,
  id,
  loadState
}: {
  model: TriviumModel
  id: string
  loadState: TriviumDetailStates
}): React.JSX.Element {
  if (!model.isTicket(id)) {
    return (
      <TriviumReaderWorkRing
        state={triviumWorkLoadState(loadState, model.work(id))}
        fraction={model.work(id).fraction}
        dashed={model.node(id)?.status !== 'adopted'}
      />
    )
  }
  // Why: a ticket's kind needs its record; before it loads, no icon beats a wrong one.
  return loadState.tickets === 'ready' ? (
    <TriviumTicketStatusIcon kind={model.ticketKind(id)} />
  ) : (
    <span aria-hidden="true" className="size-3.5 shrink-0" />
  )
}

/**
 * The header's "since your last visit" chip: what is new, what changed and how, and what left
 * the Goal model. Each row opens its item; "Mark as seen" makes the current model the baseline.
 */
export function TriviumChangesPopover({
  model,
  entries,
  changes,
  navigation,
  loadState,
  onCleared
}: {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  changes: TriviumChangeMarkers
  navigation: TriviumNavigation
  loadState: TriviumDetailStates
  /** Takes focus once "Mark as seen" removes the chip that held it. */
  onCleared: () => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const cleared = useRef(false)
  // New before changed, each in outline order.
  const items = useMemo(() => {
    const order = triviumTreeOrder(entries)
    const kind = (change: TriviumChange): number => (change.kind === 'new' ? 0 : 1)
    const position = (id: string): number => order.get(id) ?? Number.MAX_SAFE_INTEGER
    return [...changes.changes].sort(
      ([a, first], [b, second]) => kind(first) - kind(second) || position(a) - position(b)
    )
  }, [changes.changes, entries])
  const label = triviumChangesLabel({
    newCount: changes.newCount,
    changedCount: changes.changedCount,
    removedCount: changes.removed.length
  })
  if (!label) {
    return null
  }
  const title = translate('trivium.changes.title', 'Since your last visit')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" data-trivium-changes="">
          <ChangeMark kind={changes.newCount > 0 ? 'new' : 'changed'} />
          <span className="tabular-nums">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px]"
        aria-label={translate('trivium.changes.label', 'Changes since your last visit')}
        onCloseAutoFocus={(event) => {
          if (cleared.current) {
            cleared.current = false
            event.preventDefault()
            onCleared()
          }
        }}
      >
        <div className="p-2.5">
          <p className="mx-1 mt-0.5 mb-2 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            {title}
          </p>
          <div className="max-h-[min(420px,60vh)] overflow-y-auto scrollbar-sleek">
            {items.length > 0 ? (
              <ul>
                {items.map(([id, change]) => (
                  <li key={id}>
                    <button
                      type="button"
                      data-trivium-change-item={id}
                      onClick={() => {
                        setOpen(false)
                        navigation.openItem(id)
                      }}
                      className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-[13px] leading-[18px] hover:bg-trivium-row-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ChangeMark kind={change.kind} />
                      <ItemGlyph model={model} id={id} loadState={loadState} />
                      <span className="min-w-0 flex-1 break-keep wrap-anywhere">
                        <TriviumRichText inline text={model.title(id)} />
                        {change.kind === 'changed' ? (
                          <span className="block text-xs text-muted-foreground">
                            {describeTriviumChange(change, model.title)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {changes.removed.length > 0 ? (
              <div data-trivium-changes-removed="" className={cn(items.length > 0 && 'mt-2')}>
                <p className="mx-1.5 mb-1 text-xs text-muted-foreground">
                  {translate('trivium.changes.removedTitle', 'No longer in the Goal model')}
                </p>
                <ul>
                  {changes.removed.map((item) => (
                    <li
                      key={item.id}
                      className="px-1.5 py-1 text-[13px] leading-[18px] text-muted-foreground break-keep wrap-anywhere"
                    >
                      <TriviumRichText inline text={item.title} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                cleared.current = true
                setOpen(false)
                changes.markSeen()
              }}
            >
              {translate('trivium.changes.markSeen', 'Mark as seen')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
