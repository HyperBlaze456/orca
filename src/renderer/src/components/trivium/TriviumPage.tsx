import { useEffect } from 'react'
import { useAppStore } from '../../store'
import { hasVisibleOverlay } from '@/lib/visible-overlay'
import { TriviumCampaignsSection } from './TriviumCampaignsSection'
import { TriviumEscalationsSection } from './TriviumEscalationsSection'
import { TriviumGoalsSection } from './TriviumGoalsSection'
import { TriviumHeader } from './TriviumHeader'
import { TriviumHistorySection } from './TriviumHistorySection'
import { TriviumInterviewsSection } from './TriviumInterviewsSection'
import { TriviumMilestoneSection } from './TriviumMilestoneSection'
import {
  TriviumErrorScreen,
  TriviumLoadingScreen,
  TriviumNoHarnessScreen,
  TriviumServiceErrorScreen,
  TriviumUnavailableScreen,
  TriviumUnsupportedScreen
} from './TriviumStateScreens'
import { TriviumTicketsSection } from './TriviumTicketsSection'
import { useTriviumActiveWorkspace } from './use-trivium-active-workspace'
import {
  useTriviumWorkspaceStatus,
  type TriviumWorkspaceStatusResult
} from './use-trivium-workspace-status'

function TriviumPageBody({ status }: { status: TriviumWorkspaceStatusResult }): React.JSX.Element {
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
    <div className="flex-1 overflow-y-auto p-5 scrollbar-sleek">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <TriviumGoalsSection goals={data.goals} />
        <TriviumTicketsSection tickets={data.tickets} />
        <TriviumCampaignsSection campaigns={data.campaigns} />
        <TriviumMilestoneSection milestone={data.milestone} />
        <TriviumEscalationsSection escalations={data.escalations} />
        <TriviumInterviewsSection interviews={data.interviews} />
        <TriviumHistorySection
          history={data.history}
          theoryNodes={data.theory_nodes}
          warnings={data.warnings}
        />
      </div>
    </div>
  )
}

/** Full-page Track A harness state for the active workspace (git worktree or folder). */
export default function TriviumPage(): React.JSX.Element {
  const closeTriviumPage = useAppStore((state) => state.closeTriviumPage)
  const workspace = useTriviumActiveWorkspace()
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
      // Why: confirmation dialogs own Escape first; page-level Escape should
      // only leave the full page when no modal or popover is active.
      if (hasVisibleOverlay()) {
        return
      }
      const target = event.target as HTMLElement | null
      if (
        target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      event.preventDefault()
      closeTriviumPage()
    }

    // Why: tooltips can consume Escape before bubble listeners see it. Capture
    // keeps the first Escape reliable while still deferring to real overlays.
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
      <TriviumPageBody status={status} />
    </div>
  )
}
