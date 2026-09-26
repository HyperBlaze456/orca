import { ArrowUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { describeTriviumChange, type TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTierName } from './trivium-harness-text'
import type { TriviumProgressMilestone } from './trivium-progress-records'
import {
  triviumNeedState,
  triviumWorkLoadState,
  type TriviumReaderLoadState
} from './trivium-reader-load'
import { triviumMilestoneCount, triviumOutcomeLabel, triviumWorkText } from './trivium-reader-text'
import { TriviumMilestoneDiamond, TriviumOutcomeIcon } from './TriviumIcons'
import { TriviumReaderSkeleton } from './TriviumReaderPending'
import {
  TriviumReaderPill,
  TriviumReaderPillButton,
  TriviumReaderPillText
} from './TriviumReaderPill'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

function statusLabel(status: string): string {
  switch (status) {
    case 'candidate':
      return translate('trivium.goalStatus.candidate', 'Candidate')
    case 'anticipated':
      return translate('trivium.goalStatus.anticipated', 'Anticipated')
    default:
      return status
  }
}

function RelationPills({
  model,
  label,
  ids,
  navigation
}: {
  model: TriviumModel
  label: string
  ids: readonly string[]
  navigation: TriviumNavigation
}): React.JSX.Element | null {
  if (ids.length === 0) {
    return null
  }
  return (
    <>
      <span>{label}</span>
      {ids.map((id) => (
        <TriviumReaderPillButton
          key={id}
          size="sm"
          className="max-w-60 text-foreground"
          onClick={() => navigation.openItem(id)}
        >
          <TriviumReaderPillText>
            <TriviumRichText inline text={model.title(id)} />
          </TriviumReaderPillText>
        </TriviumReaderPillButton>
      ))}
    </>
  )
}

/** Linear's project header: icon tile, tier eyebrow, title and the property pills. */
export function TriviumGoalPageHeader({
  model,
  id,
  navigation,
  changes,
  loadState,
  ownMilestones
}: {
  model: TriviumModel
  id: string
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
  ownMilestones: readonly TriviumProgressMilestone[]
}): React.JSX.Element {
  const node = model.node(id)
  const tier = node?.tier ?? ''
  const status = node?.status ?? ''
  const work = model.work(id)
  const outcome = model.outcome(id)
  const workState = triviumWorkLoadState(loadState, work)
  const progressState = triviumNeedState(loadState, ['progress'])
  const change = changes.get(id)
  const parent = model.parent(id)
  const dependsOn = model.dependsOn(id)
  const requiredBy = model.requiredBy(id)
  return (
    <>
      <div
        data-trivium-goal-tile=""
        className="mb-3.5 grid size-10 place-items-center rounded-[10px] border border-border bg-muted/50"
      >
        <TriviumReaderWorkRing
          state={workState}
          size={24}
          fraction={work.fraction}
          dashed={status !== 'adopted'}
        />
      </div>
      <p className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {tier.toUpperCase()} · {triviumTierName(tier)}
      </p>
      <h2 className="mt-1.5 text-xl font-semibold text-balance break-keep wrap-anywhere">
        <TriviumRichText inline text={model.title(id)} />
      </h2>
      <div data-trivium-goal-properties="" className="mt-3.5 flex flex-wrap gap-1.5">
        {progressState === 'ready' ? (
          <TriviumReaderPill name="outcome">
            <TriviumOutcomeIcon outcome={outcome} />
            <TriviumReaderPillText>
              <span className="text-muted-foreground">
                {translate('trivium.goalPage.outcome', 'Outcome')}
              </span>{' '}
              {triviumOutcomeLabel(outcome)}
            </TriviumReaderPillText>
          </TriviumReaderPill>
        ) : null}
        {workState === 'loading' ? null : (
          <TriviumReaderPill name="work">
            <TriviumReaderWorkRing state={workState} fraction={work.fraction} />
            <TriviumReaderPillText>
              <span className="text-muted-foreground">
                {translate('trivium.goalPage.work', 'Work')}
              </span>{' '}
              {workState === 'ready' ? triviumWorkText(work) : '—'}
            </TriviumReaderPillText>
          </TriviumReaderPill>
        )}
        {workState === 'loading' || progressState === 'loading' ? (
          <TriviumReaderSkeleton className="h-6 w-32 rounded-full" />
        ) : null}
        {progressState === 'ready' && ownMilestones.length > 0 ? (
          <TriviumReaderPill name="milestones">
            <TriviumMilestoneDiamond
              review={ownMilestones.some((item) => item.campaignId === model.reviewCampaignId)}
            />
            {triviumMilestoneCount(ownMilestones.length)}
          </TriviumReaderPill>
        ) : null}
        {parent ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <TriviumReaderPillButton
                name="parent"
                className="max-w-80"
                onClick={() => navigation.openItem(parent)}
              >
                <ArrowUp aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <TriviumReaderPillText>
                  <TriviumRichText inline text={model.title(parent)} />
                </TriviumReaderPillText>
              </TriviumReaderPillButton>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4} className="max-w-96">
              {translate('trivium.goalPage.contributesTo', 'Contributes to {{goal}}', {
                goal: model.title(parent)
              })}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {status && status !== 'adopted' ? (
          <TriviumReaderPill name="status" tone={status === 'candidate' ? 'decision' : 'default'}>
            <TriviumReaderPillText>{statusLabel(status)}</TriviumReaderPillText>
          </TriviumReaderPill>
        ) : null}
        {change ? (
          <TriviumReaderPill name="change" tone="new">
            <span
              aria-hidden="true"
              className={cn(
                'inline-block size-1.75 shrink-0 rounded-full',
                change.kind === 'new' ? 'bg-trivium-new' : 'border-[1.5px] border-trivium-new'
              )}
            />
            <TriviumReaderPillText>
              {describeTriviumChange(change, model.title)}
            </TriviumReaderPillText>
          </TriviumReaderPill>
        ) : null}
      </div>
      {dependsOn.length > 0 || requiredBy.length > 0 ? (
        <div
          data-trivium-goal-relations=""
          className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          <RelationPills
            model={model}
            label={translate('trivium.goalPage.dependsOn', 'Depends on')}
            ids={dependsOn}
            navigation={navigation}
          />
          <RelationPills
            model={model}
            label={translate('trivium.goalPage.requiredBy', 'Required by')}
            ids={requiredBy}
            navigation={navigation}
          />
        </div>
      ) : null}
    </>
  )
}
