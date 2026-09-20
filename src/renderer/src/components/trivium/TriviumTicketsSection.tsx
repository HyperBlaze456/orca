import {
  TRIVIUM_TICKET_STATES,
  type TriviumTickets
} from '../../../../shared/trivium-workspace-status'
import { Badge } from '../ui/badge'
import { NativeChatCopyButton } from '../native-chat/NativeChatCopyButton'
import { translate } from '@/i18n/i18n'
import { TriviumRow, TriviumSection } from './TriviumSection'
import { triviumTicketStateLabel } from './trivium-status-display'

/** G3 tickets: counts per state, plus the candidates still owed an approve decision. */
export function TriviumTicketsSection({
  tickets,
  onSelectGoal
}: {
  tickets: TriviumTickets
  onSelectGoal?: (id: string) => void
}): React.JSX.Element {
  const total = TRIVIUM_TICKET_STATES.reduce(
    (sum, state) => sum + (tickets.by_state[state] ?? 0),
    0
  )

  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumTicketsSection.title', 'Tickets')}
      meta={
        <div className="flex flex-wrap items-center gap-x-3">
          {TRIVIUM_TICKET_STATES.map((state) => (
            <span key={state}>
              {triviumTicketStateLabel(state)} {tickets.by_state[state] ?? 0}
            </span>
          ))}
        </div>
      }
      isEmpty={total === 0 && tickets.candidates.length === 0}
      emptyLabel={translate(
        'auto.components.trivium.TriviumTicketsSection.empty',
        'No tickets. The G3 tier is unused in this repository.'
      )}
    >
      {tickets.candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.trivium.TriviumTicketsSection.noCandidates',
            'No candidate tickets are waiting for approval.'
          )}
        </p>
      ) : (
        <div>
          {tickets.candidates.map((candidate) => (
            <TriviumRow key={candidate.id}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-sm text-foreground">
                  {candidate.title}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {translate(
                    'auto.components.trivium.TriviumTicketsSection.candidate',
                    'Candidate'
                  )}
                </Badge>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 font-mono text-xs text-muted-foreground">
                <span className="break-all">{candidate.id}</span>
                <span className="break-all">
                  {translate('auto.components.trivium.TriviumTicketsSection.parent', 'Parent')}{' '}
                  {onSelectGoal ? (
                    <button
                      type="button"
                      onClick={() => onSelectGoal(candidate.parent)}
                      className="text-left text-sm break-all underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {candidate.parent}
                    </button>
                  ) : (
                    candidate.parent
                  )}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1">
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                  {candidate.approve_command}
                </code>
                <NativeChatCopyButton
                  text={candidate.approve_command}
                  label={translate(
                    'auto.components.trivium.TriviumTicketsSection.copyApprove',
                    'Copy approve command'
                  )}
                />
              </div>
            </TriviumRow>
          ))}
        </div>
      )}
    </TriviumSection>
  )
}
