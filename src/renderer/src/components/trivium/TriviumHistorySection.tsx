import type { TriviumHistory } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import { TriviumFact, TriviumSection } from './TriviumSection'

/** Cumulative record counts, plus every line the projection could not read. */
export function TriviumHistorySection({
  history,
  theoryNodes,
  warnings
}: {
  history: TriviumHistory
  theoryNodes: number
  warnings: string[]
}): React.JSX.Element {
  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumHistorySection.title', 'History')}
      isEmpty={false}
      emptyLabel=""
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <TriviumFact
          label={translate('auto.components.trivium.TriviumHistorySection.campaigns', 'Campaigns')}
        >
          {history.campaigns}
        </TriviumFact>
        <TriviumFact
          label={translate('auto.components.trivium.TriviumHistorySection.features', 'Features')}
        >
          {history.features}
        </TriviumFact>
        <TriviumFact
          label={translate(
            'auto.components.trivium.TriviumHistorySection.publications',
            'Publications'
          )}
        >
          {history.publications}
        </TriviumFact>
        <TriviumFact
          label={translate(
            'auto.components.trivium.TriviumHistorySection.theoryNodes',
            'Theory nodes'
          )}
        >
          {theoryNodes}
        </TriviumFact>
      </div>
      {warnings.length > 0 ? (
        <div className="mt-3 border-t border-border/50 pt-2">
          <div className="text-[11px] tracking-[0.05em] text-muted-foreground uppercase">
            {translate('auto.components.trivium.TriviumHistorySection.warnings', 'Warnings')}
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((warning) => (
              <li key={warning} className="text-xs text-muted-foreground">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </TriviumSection>
  )
}
