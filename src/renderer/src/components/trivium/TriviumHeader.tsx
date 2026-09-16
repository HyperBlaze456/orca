import { ArrowLeft, GitBranch, RefreshCw } from 'lucide-react'
import type { TriviumWorkspaceStatus } from '../../../../shared/trivium-workspace-status'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  shortenTriviumId,
  triviumStateBadgeVariant,
  triviumStateLabel
} from './trivium-status-display'

function PublicationId({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] tracking-[0.05em] text-muted-foreground uppercase">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-xs text-foreground">{shortenTriviumId(value)}</span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <span className="font-mono text-xs">{value}</span>
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

/** Back control, workspace identity, and the state banner every Trivium screen shares. */
export function TriviumHeader({
  workspaceName,
  workspacePath,
  status,
  onBack,
  onRefresh
}: {
  workspaceName: string | null
  workspacePath: string | null
  status: TriviumWorkspaceStatus | null
  onBack: () => void
  onRefresh?: () => void
}): React.JSX.Element {
  return (
    <div className="shrink-0 border-b border-border px-5 py-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 gap-1.5">
          <ArrowLeft className="size-3.5" />
          {translate('auto.components.trivium.TriviumHeader.back', 'Back')}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground">
              {workspaceName ?? translate('auto.components.trivium.TriviumHeader.title', 'Trivium')}
            </h1>
            {status ? (
              <Badge
                variant={triviumStateBadgeVariant(status.state)}
                data-trivium-state={status.state}
              >
                {triviumStateLabel(status.state)}
              </Badge>
            ) : null}
            {status?.is_worker_worktree ? (
              <Badge variant="outline" className="gap-1">
                <GitBranch />
                {status.repository_root
                  ? translate(
                      'auto.components.trivium.TriviumHeader.workerWorktreeOf',
                      'Worker worktree — showing the harness of {{repository}}',
                      { repository: status.repository_root }
                    )
                  : translate(
                      'auto.components.trivium.TriviumHeader.workerWorktree',
                      'Worker worktree — showing the main worktree’s harness'
                    )}
              </Badge>
            ) : null}
          </div>
          {workspacePath ? (
            <p className="truncate font-mono text-xs text-muted-foreground">{workspacePath}</p>
          ) : null}
        </div>
        {onRefresh ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onRefresh} className="shrink-0">
                <RefreshCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.trivium.TriviumHeader.refresh', 'Refresh')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {status ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {status.state_reason ? (
            <p className="text-xs text-muted-foreground">{status.state_reason}</p>
          ) : null}
          {status.harness_root ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] tracking-[0.05em] text-muted-foreground uppercase">
                {translate('auto.components.trivium.TriviumHeader.harnessRoot', 'Harness root')}
              </span>
              <span className="font-mono text-xs text-foreground">{status.harness_root}</span>
            </span>
          ) : null}
          {status.publication ? (
            <>
              <PublicationId
                label={translate('auto.components.trivium.TriviumHeader.event', 'Event')}
                value={status.publication.event_id}
              />
              <PublicationId
                label={translate('auto.components.trivium.TriviumHeader.revision', 'Revision')}
                value={status.publication.model_revision}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
