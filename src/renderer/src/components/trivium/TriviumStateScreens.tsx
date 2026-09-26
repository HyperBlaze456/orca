import { useState, type ReactNode } from 'react'
import { CloudOff, FileQuestion, FolderOpen, PlugZap, ServerOff, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumReaderCopyButton } from './TriviumReaderButtons'
import { TriviumReaderSkeleton } from './TriviumReaderPending'
import { TriviumInlineCode, TriviumRichText } from './TriviumRichText'
import { TriviumSplit } from './TriviumSplit'
import { useTriviumSession } from './use-trivium-session'

/** The Claude Code command that sets up Track A in the agent's workspace. */
export const TRIVIUM_SETUP_COMMAND = '/trivium:track-a'
const EXECUTABLE_OVERRIDE_ENV = 'TRIVIUM_EXECUTABLE'

/** The refusal slugs the host sends; anything else is already a sentence. */
function unsupportedReasonText(reason: string): string {
  if (reason === 'remote-execution-host') {
    return translate(
      'trivium.screen.remoteExecutionHost',
      'Trivium reads the harness through the process that owns the workspace filesystem, and that process does not serve this host yet.'
    )
  }
  return reason
}

function TriviumScreen({
  name,
  icon,
  title,
  description,
  children
}: {
  name: string
  icon: ReactNode
  title: string
  description: ReactNode
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div
      data-trivium-screen={name}
      className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-4 pb-10"
    >
      <div className="mx-auto mt-[12vh] max-w-[460px] text-center">
        <div className="mx-auto mb-3.5 grid size-11 place-items-center rounded-xl border border-border text-muted-foreground">
          {icon}
        </div>
        <h2 className="text-base font-semibold text-balance break-keep">{title}</h2>
        <div className="mt-2 text-[13px] leading-[21px] text-muted-foreground break-keep wrap-anywhere">
          {description}
        </div>
        {children}
      </div>
    </div>
  )
}

function ScreenActions({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div>
}

function RetryButton({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  return (
    <Button variant="outline" size="sm" onClick={onRetry}>
      {translate('trivium.screen.retry', 'Retry')}
    </Button>
  )
}

function Skeleton({ className }: { className: string }): React.JSX.Element {
  return <TriviumReaderSkeleton className={cn('block', className)} />
}

const TREE_SKELETON = [
  { key: 'root', indent: 'ml-0', width: 'w-3/5' },
  { key: 'outcome', indent: 'ml-5', width: 'w-2/3' },
  { key: 'capability', indent: 'ml-10', width: 'w-1/2' },
  { key: 'tickets', indent: 'ml-10', width: 'w-2/5' },
  { key: 'second-outcome', indent: 'ml-5', width: 'w-3/5' },
  { key: 'second-tickets', indent: 'ml-10', width: 'w-1/3' }
]

/** The page frame drawn in placeholders while the first status answer is on its way. */
export function TriviumLoadingScreen(): React.JSX.Element {
  const structure = (
    <div aria-hidden="true" className="flex h-full min-h-0 flex-col px-2 pt-2">
      {['w-24', 'w-20'].map((width) => (
        <div key={width} className="flex h-8 items-center gap-2.5 px-2.5">
          <Skeleton className="size-4" />
          <Skeleton className={width} />
        </div>
      ))}
      <div className="flex items-center pt-3.5 pr-0.5 pb-3 pl-3">
        <Skeleton className="w-12" />
        <Skeleton className="ml-auto h-7 w-36" />
      </div>
      {TREE_SKELETON.map((row) => (
        <div key={row.key} className={cn('flex h-9 items-center gap-2.5 pl-3', row.indent)}>
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className={row.width} />
        </div>
      ))}
    </div>
  )
  const reader = (
    <div
      role="status"
      aria-label={translate('trivium.screen.loading', 'Reading harness state…')}
      data-trivium-screen="loading"
      className="min-h-0 flex-1 overflow-hidden px-6 pt-6"
    >
      <div aria-hidden="true" className="mx-auto max-w-[780px]">
        <Skeleton className="w-20" />
        <Skeleton className="mt-3 h-6 w-2/3" />
        <Skeleton className="mt-3 w-1/2" />
        {['w-1/3', 'w-2/5', 'w-1/4'].map((width) => (
          <div key={width} className="mt-9 space-y-3">
            <Skeleton className={width} />
            <Skeleton className="w-full" />
            <Skeleton className="w-5/6" />
          </div>
        ))}
      </div>
    </div>
  )
  return <TriviumSplit start={structure} end={reader} />
}

export function TriviumNoWorkspaceScreen(): React.JSX.Element {
  return (
    <TriviumScreen
      name="no-workspace"
      icon={<FolderOpen aria-hidden="true" className="size-5" />}
      title={translate('trivium.screen.noWorkspaceTitle', 'No workspace selected')}
      description={translate(
        'trivium.screen.noWorkspace',
        'Select a workspace in the sidebar to see its Trivium harness.'
      )}
    />
  )
}

/**
 * No `.trivium/` yet. Setting it up is the agent's job: the button sends the setup command to
 * the selected agent session; the page itself never writes the harness.
 */
export function TriviumNoHarnessScreen({
  workspaceId,
  sessionKey
}: {
  workspaceId: string
  sessionKey: string
}): React.JSX.Element {
  const { session, targets, send, canSend, disabledReason } = useTriviumSession(
    workspaceId,
    sessionKey
  )
  const [sentTo, setSentTo] = useState<string | null>(null)
  const ask = async (): Promise<void> => {
    const agent = session.target?.title ?? ''
    setSentTo(null)
    await send(TRIVIUM_SETUP_COMMAND)
    const after = useTriviumSessionState.getState().sessions[sessionKey]
    if (after && !after.sending && !after.error) {
      setSentTo(agent)
    }
  }
  const note = session.error ? (
    <span className="text-destructive">{session.error}</span>
  ) : sentTo !== null ? (
    translate('trivium.composer.sent', 'Sent to {{agent}}', { agent: sentTo })
  ) : targets.length === 0 ? (
    translate(
      'trivium.composer.noAgent',
      'Start an agent session in this workspace to send requests from here.'
    )
  ) : canSend ? (
    ''
  ) : (
    (disabledReason ?? '')
  )
  return (
    <TriviumScreen
      name="no-harness"
      icon={<Target aria-hidden="true" className="size-5" />}
      title={translate('trivium.screen.noHarnessTitle', 'This workspace has no Trivium harness')}
      description={
        <TriviumRichText
          inline
          text={translate(
            'trivium.screen.noHarness',
            'Trivium keeps Goals, tickets and memory in `.trivium/` at the repository root. Start it from an agent session in this workspace.'
          )}
        />
      }
    >
      <ScreenActions>
        <Button
          size="sm"
          disabled={!canSend}
          aria-busy={session.sending}
          onClick={() => void ask()}
        >
          {translate('trivium.screen.askSetup', 'Ask the agent to set it up')}
        </Button>
        <TriviumReaderCopyButton
          text={TRIVIUM_SETUP_COMMAND}
          label={translate('trivium.screen.copyCommand', 'Copy command')}
        />
      </ScreenActions>
      <p
        role="status"
        data-trivium-setup-note=""
        className="mt-2 min-h-[18px] text-xs text-muted-foreground"
      >
        {note}
      </p>
    </TriviumScreen>
  )
}

export function TriviumUnsupportedScreen({
  host,
  reason
}: {
  host: string | null
  reason: string | null
}): React.JSX.Element {
  return (
    <TriviumScreen
      name="unsupported"
      icon={<ServerOff aria-hidden="true" className="size-5" />}
      title={translate('trivium.screen.unsupportedTitle', 'Trivium is not available on this host')}
      description={
        host
          ? translate(
              'trivium.screen.unsupportedHost',
              'Trivium reads the workspace on the execution host that owns it. The host {{host}} does not answer Trivium requests yet.',
              { host }
            )
          : translate(
              'trivium.screen.unsupportedNoHost',
              'Trivium reads the workspace on the execution host that owns it. This workspace has no host that answers Trivium requests yet.'
            )
      }
    >
      {reason ? (
        <p className="mt-2 text-xs text-muted-foreground break-keep wrap-anywhere">
          {unsupportedReasonText(reason)}
        </p>
      ) : null}
    </TriviumScreen>
  )
}

export function TriviumUnavailableScreen({
  host,
  reason,
  detail,
  onRetry
}: {
  host: string | null
  reason: string | null
  detail: string | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <TriviumScreen
      name="unavailable"
      icon={<PlugZap aria-hidden="true" className="size-5" />}
      title={translate('trivium.screen.unavailableTitle', 'The trivium program did not run')}
      description={
        host
          ? translate(
              'trivium.screen.unavailableHost',
              'The host {{host}} accepted the request but could not start trivium.',
              { host }
            )
          : translate(
              'trivium.screen.unavailable',
              'The host accepted the request but could not start trivium.'
            )
      }
    >
      {reason ? <p className="mt-3 text-xs text-foreground wrap-anywhere">{reason}</p> : null}
      {detail ? (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground wrap-anywhere">{detail}</p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        {translate(
          'trivium.screen.executableOverride',
          'Set {{variable}} on the execution host to point at the executable.',
          { variable: EXECUTABLE_OVERRIDE_ENV }
        )}
      </p>
      <ScreenActions>
        <RetryButton onRetry={onRetry} />
      </ScreenActions>
    </TriviumScreen>
  )
}

export function TriviumServiceErrorScreen({
  code,
  message,
  onRetry
}: {
  code: string | null
  message: string | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <TriviumScreen
      name="service-error"
      icon={<FileQuestion aria-hidden="true" className="size-5" />}
      title={translate(
        'trivium.screen.serviceErrorTitle',
        'Trivium answered, but not with a status'
      )}
      description={translate(
        'trivium.screen.serviceError',
        'The harness service is running and refused this read. Its own code is below.'
      )}
    >
      {code ? (
        <p className="mt-3 text-xs">
          <TriviumInlineCode>{code}</TriviumInlineCode>
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-muted-foreground wrap-anywhere">{message}</p>
      ) : null}
      <ScreenActions>
        <RetryButton onRetry={onRetry} />
      </ScreenActions>
    </TriviumScreen>
  )
}

/** The first read never reached the host. Nothing is known yet, so nothing is called ended. */
export function TriviumUnreachableScreen({
  reason,
  onRetry
}: {
  reason: string | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <TriviumScreen
      name="unreachable"
      icon={<CloudOff aria-hidden="true" className="size-5" />}
      title={translate('trivium.screen.unreachableTitle', "Can't reach Trivium")}
      description={translate(
        'trivium.screen.unreachable',
        'The status request did not get an answer from the execution host.'
      )}
    >
      {reason ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground wrap-anywhere">{reason}</p>
      ) : null}
      <ScreenActions>
        <RetryButton onRetry={onRetry} />
      </ScreenActions>
    </TriviumScreen>
  )
}
