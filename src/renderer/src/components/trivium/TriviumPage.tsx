import { useEffect } from 'react'
import { useAppStore } from '../../store'
import { hasVisibleOverlay } from '@/lib/visible-overlay'
import { TriviumHeader } from './TriviumHeader'
import { TriviumWorkspaceView } from './TriviumWorkspaceView'
import {
  TriviumErrorScreen,
  TriviumLoadingScreen,
  TriviumNoHarnessScreen,
  TriviumServiceErrorScreen,
  TriviumUnavailableScreen,
  TriviumUnsupportedScreen
} from './TriviumStateScreens'
import { useTriviumActiveWorkspace } from './use-trivium-active-workspace'
import {
  useTriviumWorkspaceStatus,
  type TriviumWorkspaceStatusResult
} from './use-trivium-workspace-status'

function TriviumPageBody({
  status,
  workspaceId,
  sessionKey
}: {
  status: TriviumWorkspaceStatusResult
  workspaceId: string
  sessionKey: string
}): React.JSX.Element {
  if (status.phase === 'loading') {
    return <TriviumLoadingScreen />
  }
  if (status.phase === 'unsupported') {
    return <TriviumUnsupportedScreen host={status.host} reason={status.reason} />
  }
  if (status.phase === 'unavailable') {
    return (
      <TriviumUnavailableScreen host={status.host} reason={status.reason} detail={status.detail} />
    )
  }
  if (status.phase === 'service-error') {
    return (
      <TriviumServiceErrorScreen
        code={status.reason}
        message={status.detail}
        onRetry={status.refresh}
      />
    )
  }
  if (status.phase === 'error' || !status.data) {
    return <TriviumErrorScreen reason={status.reason} onRetry={status.refresh} />
  }
  const data = status.data
  if (data.state === 'no-harness') {
    return <TriviumNoHarnessScreen requestedPath={data.requested_path} />
  }
  return (
    <TriviumWorkspaceView
      key={sessionKey}
      data={data}
      workspaceId={workspaceId}
      sessionKey={sessionKey}
    />
  )
}

/** Full-page Track A harness state for the active workspace (git worktree or folder). */
export default function TriviumPage(): React.JSX.Element {
  const closeTriviumPage = useAppStore((state) => state.closeTriviumPage)
  const workspace = useTriviumActiveWorkspace()
  const executionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const sessionKey = JSON.stringify([
    executionHostId,
    workspace?.connectionId,
    workspace?.id,
    workspace?.path
  ])
  const status = useTriviumWorkspaceStatus(
    workspace?.id ?? null,
    workspace?.path ?? null,
    workspace?.connectionId
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      // Overlays own Escape before page navigation.
      if (hasVisibleOverlay()) {
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        target?.closest('.xterm, .react-flow') ||
        target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      event.preventDefault()
      closeTriviumPage()
    }

    // Capture Escape before tooltip listeners consume it.
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [closeTriviumPage])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TriviumHeader
        workspaceName={workspace?.name ?? null}
        workspacePath={workspace?.path ?? null}
        status={status.data}
        onBack={closeTriviumPage}
        onRefresh={status.refresh}
      />
      <TriviumPageBody status={status} workspaceId={workspace?.id ?? ''} sessionKey={sessionKey} />
    </div>
  )
}
