import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import { triviumIdSlug } from './trivium-harness-text'
import { formatTriviumCount, triviumShortRevision } from './trivium-reader-text'
import { TriviumReaderCopyButton } from './TriviumReaderButtons'
import { TriviumReaderFacts, type TriviumReaderFact } from './TriviumReaderSection'
import { TriviumInlineCode } from './TriviumRichText'

// Same facts and keys as the Overview's "Workspace details" disclosure, one click from anywhere.
function workspaceFacts(model: TriviumModel): TriviumReaderFact[] {
  const { status, revision } = model
  const authority = model.progress?.theoryAuthority ?? {}
  return [
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
              <span key={interview.id}>
                {triviumIdSlug(interview.id)}{' '}
                <span className="text-muted-foreground">{`(${interview.phase.replace(/-/g, ' ')})`}</span>
              </span>
            ))}
          </span>
        ) : (
          translate('trivium.workspace.noInterviews', 'None')
        )
    }
  ]
}

/** The header's details icon: where the harness lives and what it holds. */
export function TriviumInfoPopover({ model }: { model: TriviumModel }): React.JSX.Element {
  const label = translate('trivium.workspace.details', 'Workspace details')
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={label} data-trivium-info="">
              <Info aria-hidden="true" className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {/* Bottom: the header sits at the top edge of the window. */}
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[360px]" aria-label={label}>
        <div className="px-3.5 pt-3 pb-3.5">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            {label}
          </p>
          <TriviumReaderFacts facts={workspaceFacts(model)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
