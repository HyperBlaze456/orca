import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TriviumModel } from './trivium-goal-model'
import {
  triviumNeedState,
  triviumWorkLoadState,
  type TriviumReaderLoadState
} from './trivium-reader-load'
import { triviumOutcomeLabel, triviumWorkText } from './trivium-reader-text'
import { TriviumOutcomeIcon } from './TriviumIcons'
import { TriviumReaderSkeleton } from './TriviumReaderPending'
import { TriviumReaderPill } from './TriviumReaderPill'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

/**
 * Goal rows (Overview "Goals", Goal page "Sub-goals"): the ring and "N/M tickets done" count
 * work; the outcome pill is a separate judgment and reads "Not assessed" until assessed. A
 * count that failed to load reads "—"; the page reports the failure once with Retry.
 */
export function TriviumReaderGoalRows({
  model,
  ids,
  loadState,
  navigation
}: {
  model: TriviumModel
  ids: readonly string[]
  loadState: TriviumReaderLoadState
  navigation: TriviumNavigation
}): React.JSX.Element {
  const outcomeState = triviumNeedState(loadState, ['progress'])
  return (
    <div className="-mx-2">
      {ids.map((id) => {
        const work = model.work(id)
        const workState = triviumWorkLoadState(loadState, work)
        const outcome = model.outcome(id)
        return (
          <button
            key={id}
            type="button"
            data-trivium-goal-row={id}
            onClick={() => navigation.openItem(id)}
            className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-[7px] text-left hover:bg-trivium-row-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="grid w-4 shrink-0 place-items-center">
              <TriviumReaderWorkRing
                state={workState}
                size={16}
                fraction={work.fraction}
                dashed={model.node(id)?.status !== 'adopted'}
              />
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 flex-1 truncate text-[13px] leading-5 font-medium">
                  <TriviumRichText inline text={model.title(id)} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4} className="max-w-96">
                {model.title(id)}
              </TooltipContent>
            </Tooltip>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
              {workState === 'ready' ? (
                <span data-trivium-work="">{triviumWorkText(work)}</span>
              ) : null}
              {workState === 'loading' ? <TriviumReaderSkeleton /> : null}
              {workState === 'error' ? <span data-trivium-work-unknown="">—</span> : null}
              {outcomeState === 'ready' ? (
                <TriviumReaderPill size="sm" className="text-foreground">
                  <TriviumOutcomeIcon size={12} outcome={outcome} />
                  {triviumOutcomeLabel(outcome)}
                </TriviumReaderPill>
              ) : null}
              <span className="w-[22px] text-right text-[11px]">
                {(model.node(id)?.tier ?? '').toUpperCase()}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
