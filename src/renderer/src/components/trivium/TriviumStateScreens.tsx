import { CircleAlert, FileQuestion, Loader2, PlugZap, ServerOff, Sprout } from 'lucide-react'
import { Button } from '../ui/button'
import { NativeChatCopyButton } from '../native-chat/NativeChatCopyButton'
import { translate } from '@/i18n/i18n'

const HARNESS_INIT_COMMAND = 'trivium model init'
const EXECUTABLE_OVERRIDE_ENV = 'TRIVIUM_EXECUTABLE'

/** The refusal slugs the host sends; anything else is already a sentence. */
function unsupportedReasonText(reason: string): string {
  if (reason === 'remote-execution-host') {
    return translate(
      'auto.components.trivium.TriviumStateScreens.remoteExecutionHost',
      'Trivium reads the harness through the process that owns the workspace filesystem, and that process does not serve this host yet.'
    )
  }
  return reason
}

function CommandBlock({ command }: { command: string }): React.JSX.Element {
  return (
    <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{command}</code>
      <NativeChatCopyButton
        text={command}
        label={translate('auto.components.trivium.TriviumStateScreens.copyCommand', 'Copy command')}
      />
    </div>
  )
}

function Screen({
  icon,
  title,
  description,
  children
}: {
  icon: React.ReactNode
  title: string
  description: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/30 text-muted-foreground">
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  )
}

export function TriviumLoadingScreen(): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {translate('auto.components.trivium.TriviumStateScreens.loading', 'Reading harness state…')}
    </div>
  )
}

export function TriviumNoHarnessScreen({
  requestedPath
}: {
  requestedPath: string | null
}): React.JSX.Element {
  return (
    <Screen
      icon={<Sprout className="size-6" />}
      title={translate(
        'auto.components.trivium.TriviumStateScreens.noHarnessTitle',
        'No Trivium harness here'
      )}
      description={
        requestedPath
          ? translate(
              'auto.components.trivium.TriviumStateScreens.noHarnessAtPath',
              'There is no .trivium directory at or above {{path}}. Initialize the harness to start tracking Goals, Campaigns and tickets.',
              { path: requestedPath }
            )
          : translate(
              'auto.components.trivium.TriviumStateScreens.noHarness',
              'There is no .trivium directory in this workspace. Initialize the harness to start tracking Goals, Campaigns and tickets.'
            )
      }
    >
      <CommandBlock command={HARNESS_INIT_COMMAND} />
    </Screen>
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
    <Screen
      icon={<ServerOff className="size-6" />}
      title={translate(
        'auto.components.trivium.TriviumStateScreens.unsupportedTitle',
        'Trivium is not available on this host'
      )}
      description={
        host
          ? translate(
              'auto.components.trivium.TriviumStateScreens.unsupportedHost',
              'Trivium reads the workspace on the execution host that owns it. The host {{host}} does not answer Trivium requests yet.',
              { host }
            )
          : translate(
              'auto.components.trivium.TriviumStateScreens.unsupportedNoHost',
              'Trivium reads the workspace on the execution host that owns it. This workspace has no host that answers Trivium requests yet.'
            )
      }
    >
      {reason ? (
        <p className="max-w-md text-xs text-muted-foreground">{unsupportedReasonText(reason)}</p>
      ) : null}
    </Screen>
  )
}

export function TriviumUnavailableScreen({
  host,
  reason,
  detail
}: {
  host: string | null
  reason: string | null
  detail: string | null
}): React.JSX.Element {
  return (
    <Screen
      icon={<PlugZap className="size-6" />}
      title={translate(
        'auto.components.trivium.TriviumStateScreens.unavailableTitle',
        'The trivium program did not run'
      )}
      description={
        host
          ? translate(
              'auto.components.trivium.TriviumStateScreens.unavailableHost',
              'The host {{host}} accepted the request but could not start trivium.',
              { host }
            )
          : translate(
              'auto.components.trivium.TriviumStateScreens.unavailable',
              'The host accepted the request but could not start trivium.'
            )
      }
    >
      {reason ? <p className="max-w-md text-xs text-foreground">{reason}</p> : null}
      {detail ? (
        <p className="max-w-md font-mono text-[11px] break-words text-muted-foreground">{detail}</p>
      ) : null}
      <p className="max-w-md text-xs text-muted-foreground">
        {translate(
          'auto.components.trivium.TriviumStateScreens.executableOverride',
          'Set {{variable}} on the execution host to point at the executable.',
          { variable: EXECUTABLE_OVERRIDE_ENV }
        )}
      </p>
    </Screen>
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
    <Screen
      icon={<FileQuestion className="size-6" />}
      title={translate(
        'auto.components.trivium.TriviumStateScreens.serviceErrorTitle',
        'Trivium answered, but not with a status'
      )}
      description={translate(
        'auto.components.trivium.TriviumStateScreens.serviceErrorDescription',
        'The harness service is running and refused this read. Its own code is below.'
      )}
    >
      {code ? <code className="font-mono text-xs text-foreground">{code}</code> : null}
      {message ? <p className="max-w-md text-xs text-muted-foreground">{message}</p> : null}
      <Button variant="outline" size="sm" onClick={onRetry}>
        {translate('auto.components.trivium.TriviumStateScreens.retry', 'Retry')}
      </Button>
    </Screen>
  )
}

export function TriviumErrorScreen({
  reason,
  onRetry
}: {
  reason: string | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <Screen
      icon={<CircleAlert className="size-6" />}
      title={translate(
        'auto.components.trivium.TriviumStateScreens.errorTitle',
        'Could not read the harness'
      )}
      description={
        reason ??
        translate(
          'auto.components.trivium.TriviumStateScreens.errorFallback',
          'The status request failed without a message.'
        )
      }
    >
      <Button variant="outline" size="sm" onClick={onRetry}>
        {translate('auto.components.trivium.TriviumStateScreens.retry', 'Retry')}
      </Button>
    </Screen>
  )
}
