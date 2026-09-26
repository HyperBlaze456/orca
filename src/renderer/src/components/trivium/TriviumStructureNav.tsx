import type { ReactNode } from 'react'
import { Clock, Inbox } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumNavigation } from './use-trivium-navigation'

function TriviumStructureNavRow({
  icon,
  label,
  current,
  onClick,
  children
}: {
  icon: ReactNode
  label: string
  current: boolean
  onClick: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      data-current={current ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring',
        current ? 'bg-trivium-row-selected font-medium' : 'hover:bg-trivium-row-hover'
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {children}
    </button>
  )
}

/** Overview (with the needs-you count) and All tickets, above the Goal outline. */
export function TriviumStructureNav({
  navigation,
  needsYouCount,
  ticketCount
}: {
  navigation: TriviumNavigation
  needsYouCount: number
  ticketCount: number
}): React.JSX.Element {
  const { route, selectedKey } = navigation
  return (
    <nav
      aria-label={translate('trivium.structure.views', 'Trivium views')}
      className="flex shrink-0 flex-col gap-px px-2 pt-2 pb-0.5"
    >
      <TriviumStructureNavRow
        icon={<Inbox aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        label={translate('trivium.structure.overview', 'Overview')}
        current={route.view === 'overview'}
        onClick={navigation.openOverview}
      >
        {needsYouCount > 0 ? (
          <span
            data-trivium-needs-you=""
            className="ml-auto inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-trivium-decision px-[5px] text-[11px] font-semibold text-trivium-on-color tabular-nums"
          >
            <span aria-hidden="true">{needsYouCount}</span>
            <span className="sr-only">
              {translate('trivium.structure.needsYouCount', '{{count}} need you', {
                count: needsYouCount
              })}
            </span>
          </span>
        ) : null}
      </TriviumStructureNavRow>
      <TriviumStructureNavRow
        icon={<Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        label={translate('trivium.structure.allTickets', 'All tickets')}
        // A list opened from the reader has no tree row to mark, so this row stands for it.
        current={route.view === 'tickets' && selectedKey === null}
        onClick={() => navigation.openTickets(null)}
      >
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ticketCount}</span>
      </TriviumStructureNavRow>
    </nav>
  )
}
