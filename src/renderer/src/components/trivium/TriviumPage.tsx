import { useEffect } from 'react'
import { useAppStore } from '../../store'
import { hasVisibleOverlay } from '@/lib/visible-overlay'
import { useTriviumPageData, type TriviumPageData } from './trivium-page-data'
import { TriviumHeader } from './TriviumHeader'
import { TriviumReader } from './TriviumReader'
import { TriviumSplit } from './TriviumSplit'
import {
  TriviumLoadingScreen,
  TriviumNoHarnessScreen,
  TriviumNoWorkspaceScreen,
  TriviumServiceErrorScreen,
  TriviumUnavailableScreen,
  TriviumUnreachableScreen,
  TriviumUnsupportedScreen
} from './TriviumStateScreens'
import { TriviumStructurePane } from './TriviumStructurePane'
import {
  useTriviumActiveWorkspace,
  type TriviumActiveWorkspace
} from './use-trivium-active-workspace'

function TriviumPageBody({
  workspace,
  page,
  sessionKey
}: {
  workspace: TriviumActiveWorkspace | null
  page: TriviumPageData
  sessionKey: string
}): React.JSX.Element {
  const { status, frame } = page
  if (!workspace) {
    return <TriviumNoWorkspaceScreen />
  }
  if (frame) {
    return (
      <TriviumSplit
        key={frame.storageKey}
        start={
          <TriviumStructurePane
            model={frame.model}
            entries={frame.entries}
            navigation={frame.navigation}
            changes={frame.changes.changes}
            needsYouCount={frame.needsYouCount}
            ticketCount={frame.model.ticketIds.length}
          />
        }
        end={
          <TriviumReader
            model={frame.model}
            entries={frame.entries}
            navigation={frame.navigation}
            changes={frame.changes.changes}
            loadState={frame.loadState}
            workspaceId={workspace.id}
            sessionKey={sessionKey}
          />
        }
      />
    )
  }
  if (status.data?.state === 'no-harness') {
    return <TriviumNoHarnessScreen workspaceId={workspace.id} sessionKey={sessionKey} />
  }
  switch (status.phase) {
    case 'unsupported':
      return <TriviumUnsupportedScreen host={status.host} reason={status.reason} />
    case 'unavailable':
      return (
        <TriviumUnavailableScreen
          host={status.host}
          reason={status.reason}
          detail={status.detail}
          onRetry={status.refresh}
        />
      )
    case 'service-error':
      return (
        <TriviumServiceErrorScreen
          code={status.reason}
          message={status.detail}
          onRetry={status.refresh}
        />
      )
    case 'error':
      return <TriviumUnreachableScreen reason={status.reason} onRetry={status.refresh} />
    case 'loading':
    case 'ready':
      return <TriviumLoadingScreen />
  }
}

/** Escape leaves the page unless an overlay, a text field or a terminal owns the key. */
function useTriviumPageEscape(close: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || hasVisibleOverlay()) {
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        target?.closest('.xterm') ||
        target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      event.preventDefault()
      close()
    }
    // Capture Escape before tooltip listeners consume it.
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [close])
}

/**
 * Full-page Track A harness state for the active workspace (git worktree or folder): one header
 * band, then the Goal structure beside the reader. Everything is read-only; changes go through
 * an agent session.
 */
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
  const page = useTriviumPageData(workspace)
  useTriviumPageEscape(closeTriviumPage)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TriviumHeader
        state={workspace ? (page.status.data?.state ?? null) : null}
        stale={workspace ? page.stale : null}
        frame={page.frame}
        onRefresh={page.refresh}
      />
      <TriviumPageBody workspace={workspace} page={page} sessionKey={sessionKey} />
    </div>
  )
}
