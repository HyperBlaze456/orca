import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTreeOrder, type TriviumTreeEntry } from './trivium-goal-tree'
import { humanizeTriviumReason } from './trivium-harness-text'
import { triviumOpenQuestions } from './trivium-milestones'
import { buildTriviumNeedsYou } from './trivium-needs-you'
import { triviumNeedState, type TriviumReaderLoadState } from './trivium-reader-load'
import { triviumOverviewHeadline } from './trivium-reader-text'
import { TriviumMemorySummary } from './TriviumMemorySummary'
import { TriviumOverviewOpenQuestions } from './TriviumOpenQuestions'
import { TriviumOverviewCampaigns } from './TriviumOverviewCampaigns'
import { TriviumOverviewNeedsYou } from './TriviumOverviewNeedsYou'
import {
  TriviumOverviewGuidance,
  TriviumOverviewInterviews,
  TriviumWorkspaceDetails
} from './TriviumOverviewWorkspace'
import { TriviumReaderGoalRows } from './TriviumReaderGoalRows'
import { TriviumReaderPending } from './TriviumReaderPending'
import { TriviumReaderSection } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

/**
 * AXIS A8: what needs the user comes first, then outcomes and open judgments. Ticket counts
 * are labelled as work and never stand in for a Goal's outcome.
 */
export function TriviumOverview({
  model,
  entries,
  navigation,
  changes,
  loadState
}: {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
}): React.JSX.Element {
  const needsYou = useMemo(() => buildTriviumNeedsYou(model), [model])
  const goalIds = useMemo(
    () => [...triviumTreeOrder(entries).keys()].filter((id) => !model.isTicket(id)),
    [entries, model]
  )
  const questions = useMemo(() => triviumOpenQuestions(model), [model])
  const { state, state_reason: reason } = model.status
  const ticketsState = triviumNeedState(loadState, ['tickets'])
  const progressState = triviumNeedState(loadState, ['progress'])
  const memory = model.progress?.memory ?? null
  return (
    <div data-trivium-page="overview">
      <p className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {translate('trivium.overview.eyebrow', 'Overview')}
      </p>
      <h2 className="mt-1.5 text-xl font-semibold text-balance break-keep wrap-anywhere">
        {triviumOverviewHeadline(state)}
      </h2>
      {reason ? (
        <TriviumRichText
          text={humanizeTriviumReason(reason)}
          className="mt-2 max-w-[68ch] text-sm leading-[22px] text-muted-foreground"
        />
      ) : null}
      {needsYou.length > 0 ? (
        <TriviumOverviewNeedsYou
          model={model}
          items={needsYou}
          changes={changes}
          navigation={navigation}
        />
      ) : null}
      {state === 'no-adopted-goal' || state === 'goal-draft' ? (
        <>
          <TriviumOverviewInterviews model={model} />
          <TriviumOverviewGuidance state={state} />
        </>
      ) : null}
      {goalIds.length > 0 ? (
        <TriviumReaderSection
          name="goals"
          title={translate('trivium.overview.goals', 'Goals')}
          end={
            <span className="text-xs text-muted-foreground">
              {translate(
                'trivium.overview.workNote',
                'Work counts tickets done. Outcome needs assessed success criteria.'
              )}
            </span>
          }
        >
          <TriviumReaderGoalRows
            model={model}
            ids={goalIds}
            loadState={loadState}
            navigation={navigation}
          />
          {/* Work counts tickets: said here even when progress recorded every count. */}
          {ticketsState === 'error' ? (
            <TriviumReaderPending state={ticketsState} need="tickets" onRetry={loadState.retry} />
          ) : null}
        </TriviumReaderSection>
      ) : null}
      {progressState === 'ready' ? (
        <>
          {questions.contradictions.length + questions.unknowns.length > 0 ? (
            <TriviumOverviewOpenQuestions questions={questions} />
          ) : null}
          {memory ? (
            <TriviumMemorySummary
              memory={memory}
              campaignCount={model.progress?.campaigns.length ?? 0}
            />
          ) : null}
          <TriviumOverviewCampaigns model={model} navigation={navigation} />
        </>
      ) : (
        <div data-trivium-section="progress-pending" className="mt-7">
          <TriviumReaderPending state={progressState} need="progress" onRetry={loadState.retry} />
        </div>
      )}
      <TriviumWorkspaceDetails model={model} />
    </div>
  )
}
