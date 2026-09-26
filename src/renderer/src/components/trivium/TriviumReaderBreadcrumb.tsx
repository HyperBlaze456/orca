import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

/** The Goals above an item, root first; each opens its Goal page. */
export function TriviumReaderBreadcrumb({
  model,
  id,
  navigation
}: {
  model: TriviumModel
  id: string
  navigation: TriviumNavigation
}): React.JSX.Element {
  const chain = model.ancestors(id)
  return (
    <nav
      aria-label={translate('trivium.reader.goalPath', 'Goal path')}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"
    >
      {chain.length === 0 ? <span>{translate('trivium.reader.goals', 'Goals')}</span> : null}
      {chain.map((ancestor, index) => (
        <Fragment key={ancestor}>
          {index > 0 ? <ChevronRight aria-hidden="true" className="size-3 shrink-0" /> : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => navigation.openItem(ancestor)}
                className="max-w-[30ch] truncate rounded-sm underline-offset-3 hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              >
                <TriviumRichText inline text={model.title(ancestor)} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4} className="max-w-80">
              {model.title(ancestor)}
            </TooltipContent>
          </Tooltip>
        </Fragment>
      ))}
    </nav>
  )
}
