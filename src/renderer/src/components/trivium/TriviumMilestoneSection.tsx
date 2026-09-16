import type { TriviumMilestone } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import { TriviumFact, TriviumSection } from './TriviumSection'

/** The newest synthesized milestone: its summary and the three review counts. */
export function TriviumMilestoneSection({
  milestone
}: {
  milestone: TriviumMilestone | null
}): React.JSX.Element {
  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumMilestoneSection.title', 'Milestone')}
      meta={milestone ? <span className="font-mono">{milestone.campaign_id}</span> : undefined}
      isEmpty={milestone === null}
      emptyLabel={translate(
        'auto.components.trivium.TriviumMilestoneSection.empty',
        'No Campaign is standing at a milestone.'
      )}
    >
      {milestone ? (
        <div className="space-y-3">
          <p className="text-xs text-foreground">
            {milestone.summary ||
              translate(
                'auto.components.trivium.TriviumMilestoneSection.noSummary',
                'The milestone recorded no summary.'
              )}
          </p>
          <div className="grid grid-cols-3 gap-x-4">
            <TriviumFact
              label={translate(
                'auto.components.trivium.TriviumMilestoneSection.unknowns',
                'Unknowns'
              )}
            >
              {milestone.unknowns}
            </TriviumFact>
            <TriviumFact
              label={translate(
                'auto.components.trivium.TriviumMilestoneSection.contradictions',
                'Contradictions'
              )}
            >
              {milestone.contradictions}
            </TriviumFact>
            <TriviumFact
              label={translate(
                'auto.components.trivium.TriviumMilestoneSection.promotionCandidates',
                'Promotion candidates'
              )}
            >
              {milestone.promotion_candidates}
            </TriviumFact>
          </div>
        </div>
      ) : null}
    </TriviumSection>
  )
}
