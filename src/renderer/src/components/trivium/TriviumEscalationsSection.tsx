import type { TriviumEscalation } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import { TriviumRow, TriviumSection } from './TriviumSection'

/** Feature journals that ended in an escalation the user owns. */
export function TriviumEscalationsSection({
  escalations
}: {
  escalations: TriviumEscalation[]
}): React.JSX.Element {
  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumEscalationsSection.title', 'Escalations')}
      isEmpty={escalations.length === 0}
      emptyLabel={translate(
        'auto.components.trivium.TriviumEscalationsSection.empty',
        'Nothing is waiting on a decision from you.'
      )}
    >
      <div>
        {escalations.map((escalation) => (
          <TriviumRow key={`${escalation.feature_id}/${escalation.intent_id}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 font-mono text-xs text-foreground">
              <span className="truncate">{escalation.feature_id}</span>
              <span className="truncate text-muted-foreground">{escalation.intent_id}</span>
            </div>
            {escalation.reasons.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {escalation.reasons.map((reason) => (
                  <li key={reason} className="text-xs text-muted-foreground">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </TriviumRow>
        ))}
      </div>
    </TriviumSection>
  )
}
