import type { TriviumInterview } from '../../../../shared/trivium-workspace-status'
import { Badge } from '../ui/badge'
import { translate } from '@/i18n/i18n'
import { TriviumRow, TriviumSection } from './TriviumSection'

/** Interview sessions that have neither adopted nor abandoned their draft. */
export function TriviumInterviewsSection({
  interviews
}: {
  interviews: TriviumInterview[]
}): React.JSX.Element {
  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumInterviewsSection.title', 'Interviews')}
      isEmpty={interviews.length === 0}
      emptyLabel={translate(
        'auto.components.trivium.TriviumInterviewsSection.empty',
        'No interview session is open.'
      )}
    >
      <div>
        {interviews.map((interview) => (
          <TriviumRow key={interview.id}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                {interview.id}
              </span>
              <Badge variant="outline" className="shrink-0">
                {interview.track}
              </Badge>
              <Badge variant="secondary" className="shrink-0">
                {interview.phase}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">{interview.created_at}</span>
          </TriviumRow>
        ))}
      </div>
    </TriviumSection>
  )
}
