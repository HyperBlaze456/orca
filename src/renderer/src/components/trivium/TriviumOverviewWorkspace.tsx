import { MessagesSquare } from 'lucide-react'
import type {
  TriviumInterview,
  TriviumWorkspaceState
} from '../../../../shared/trivium-workspace-status'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import { triviumIdSlug } from './trivium-harness-text'
import { formatTriviumCount, triviumShortRevision } from './trivium-reader-text'
import { TriviumReaderCopyButton } from './TriviumReaderButtons'
import {
  TriviumReaderDisclosure,
  TriviumReaderFacts,
  TriviumReaderSection
} from './TriviumReaderSection'
import { TriviumInlineCode } from './TriviumRichText'

function interviewWhen(createdAt: string): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime())
    ? createdAt
    : new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: 'medium' }).format(date)
}

function interviewTrack(interview: TriviumInterview): string {
  return interview.track === 'theory'
    ? translate('trivium.interviews.theory', 'Theory interview')
    : translate('trivium.interviews.goal', 'Goal interview')
}

function interviewLine(interview: TriviumInterview): string {
  return `${triviumIdSlug(interview.id)} (${interview.phase.replace(/-/g, ' ')})`
}

/** Harness facts behind the page, folded at the end of the Overview. */
export function TriviumWorkspaceDetails({ model }: { model: TriviumModel }): React.JSX.Element {
  const { status, revision } = model
  const authority = model.progress?.theoryAuthority ?? {}
  const facts = [
    {
      label: translate('trivium.workspace.harness', 'Harness'),
      value: <TriviumInlineCode>{status.harness_root ?? '—'}</TriviumInlineCode>
    },
    {
      label: translate('trivium.workspace.revision', 'Model revision'),
      value: revision ? (
        <>
          <TriviumInlineCode>{triviumShortRevision(revision)}</TriviumInlineCode>
          <TriviumReaderCopyButton
            text={revision}
            label={translate('trivium.reader.copy', 'Copy')}
          />
        </>
      ) : (
        '—'
      )
    },
    {
      label: translate('trivium.workspace.theory', 'Theory'),
      value: translate(
        'trivium.workspace.theoryCounts',
        '{{nodes}} nodes · {{promoted}} promoted · {{milestone}} from milestones',
        {
          nodes: formatTriviumCount(status.theory_nodes),
          promoted: formatTriviumCount(authority.promoted ?? 0),
          milestone: formatTriviumCount(authority.milestone ?? 0)
        }
      )
    },
    {
      label: translate('trivium.workspace.history', 'History'),
      value: translate(
        'trivium.workspace.historyCounts',
        '{{campaigns}} Campaigns · {{features}} features · {{publications}} publications',
        {
          campaigns: formatTriviumCount(status.history.campaigns),
          features: formatTriviumCount(status.history.features),
          publications: formatTriviumCount(status.history.publications)
        }
      )
    },
    {
      label: translate('trivium.workspace.interviews', 'Interviews'),
      value:
        status.interviews.length > 0 ? (
          <span className="flex flex-col">
            {status.interviews.map((interview) => (
              <span key={interview.id}>{interviewLine(interview)}</span>
            ))}
          </span>
        ) : (
          translate('trivium.workspace.noInterviews', 'None')
        )
    }
  ]
  return (
    <TriviumReaderDisclosure
      name="workspace-details"
      label={translate('trivium.workspace.details', 'Workspace details')}
    >
      <TriviumReaderFacts facts={facts} />
    </TriviumReaderDisclosure>
  )
}

/** Before a Goal is adopted the Overview shows the interviews that form it. */
export function TriviumOverviewInterviews({ model }: { model: TriviumModel }): React.JSX.Element {
  const interviews = model.status.interviews
  return (
    <TriviumReaderSection
      name="interviews"
      title={translate('trivium.interviews.title', 'Interviews')}
      count={interviews.length}
    >
      {interviews.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {translate('trivium.interviews.none', 'No interview has started yet.')}
        </p>
      ) : (
        <ul>
          {interviews.map((interview) => (
            <li key={interview.id} className="flex items-start gap-2.5 py-1.5">
              <MessagesSquare
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0">
                <p className="text-[13px] leading-5 wrap-anywhere">{triviumIdSlug(interview.id)}</p>
                <p className="text-xs text-muted-foreground wrap-anywhere">
                  {interviewTrack(interview)} · {interview.phase.replace(/-/g, ' ')} ·{' '}
                  {interviewWhen(interview.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TriviumReaderSection>
  )
}

export function TriviumOverviewGuidance({
  state
}: {
  state: Extract<TriviumWorkspaceState, 'no-adopted-goal' | 'goal-draft'>
}): React.JSX.Element {
  return (
    <TriviumReaderSection name="guidance" title={translate('trivium.guidance.title', 'Next step')}>
      <p className="max-w-[68ch] text-sm leading-[1.7] text-muted-foreground">
        {state === 'goal-draft'
          ? translate(
              'trivium.guidance.goalDraft',
              'A Goal draft waits for your review. Ask the agent in this workspace to show it, then adopt it or ask for changes. Adopted Goals appear here with their sub-goals and tickets.'
            )
          : translate(
              'trivium.guidance.noAdoptedGoal',
              'Trivium works toward an adopted Goal. Continue the Goal interview from an agent session in this workspace; once you adopt a Goal, it appears here with its sub-goals and tickets.'
            )}
      </p>
    </TriviumReaderSection>
  )
}
