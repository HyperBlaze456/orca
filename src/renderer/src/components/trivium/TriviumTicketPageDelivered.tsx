import { translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import type { TriviumProgressFeature } from './trivium-progress-records'
import { triviumNeedState, type TriviumReaderLoadState } from './trivium-reader-load'
import { triviumFeatureResultKind, triviumFeatureResultLabel } from './trivium-reader-text'
import { TriviumTicketStatusIcon } from './TriviumIcons'
import { TriviumReaderExpandableText } from './TriviumReaderClamp'
import { TriviumReaderPending } from './TriviumReaderPending'
import { TriviumReaderCommitPill } from './TriviumReaderPill'
import { TriviumReaderSection } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'

function FeatureNote({
  model,
  feature
}: {
  model: TriviumModel
  feature: TriviumProgressFeature
}): React.JSX.Element | null {
  if (feature.result === 'blocked' && feature.blocker) {
    return (
      <p className="mt-1 text-xs text-trivium-blocked break-keep wrap-anywhere">
        {translate('trivium.feature.waitsOn', 'Waits on {{ticket}}', {
          ticket: model.title(feature.blocker)
        })}
      </p>
    )
  }
  if (feature.result === 'deduplicated' && feature.existing) {
    return (
      <p className="mt-1 text-xs text-muted-foreground break-keep wrap-anywhere">
        {translate('trivium.feature.deliveredUnder', 'Delivered under {{ticket}}', {
          ticket: model.title(feature.existing)
        })}
      </p>
    )
  }
  return null
}

/** The Feature runs behind a ticket: result, merged commit and the worker's outcome. */
export function TriviumTicketPageDelivered({
  model,
  id,
  loadState
}: {
  model: TriviumModel
  id: string
  loadState: TriviumReaderLoadState
}): React.JSX.Element | null {
  const progressState = triviumNeedState(loadState, ['progress'])
  if (progressState !== 'ready') {
    return (
      <div data-trivium-section="progress-pending" className="mt-7">
        <TriviumReaderPending state={progressState} need="progress" onRetry={loadState.retry} />
      </div>
    )
  }
  const features = model.ticketFeatures(id)
  if (features.length === 0) {
    return null
  }
  return (
    <TriviumReaderSection
      name="delivered-by"
      title={translate('trivium.ticketPage.deliveredBy', 'Delivered by')}
      count={features.length}
    >
      <div className="flex flex-col gap-2">
        {features.map((feature) => (
          <article
            key={feature.id}
            data-trivium-feature={feature.id}
            className="rounded-xl border border-border bg-card px-3.5 py-3 text-card-foreground"
          >
            <header className="flex min-w-0 items-start gap-2">
              <span className="grid h-5 shrink-0 place-items-center">
                <TriviumTicketStatusIcon
                  kind={triviumFeatureResultKind(feature.result)}
                  label={triviumFeatureResultLabel(feature.result)}
                />
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-5 font-medium">
                <TriviumRichText inline text={feature.title} />
              </span>
              {feature.mergedCommit ? (
                <TriviumReaderCommitPill commit={feature.mergedCommit} />
              ) : null}
            </header>
            <FeatureNote model={model} feature={feature} />
            {feature.outcome ? (
              <TriviumReaderExpandableText
                text={feature.outcome}
                lines={3}
                className="mt-1.5 text-[13px] leading-5 text-muted-foreground"
              />
            ) : null}
          </article>
        ))}
      </div>
    </TriviumReaderSection>
  )
}
