import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { AgentTerminalPreview } from '@/components/dashboard-popout/AgentTerminalPreview'
import { resolveDashboardCardTerminalInput } from '@/components/dashboard/dashboard-card-terminal-input'
import { readDashboardClientHost } from '@/components/dashboard/dashboard-client-host'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TriviumSessionTarget } from './trivium-session-state'

export function TriviumSessionTerminal({
  target,
  workspaceId,
  workspacePath
}: {
  target: TriviumSessionTarget
  workspaceId: string
  workspacePath: string
}): React.JSX.Element {
  const clientHost = readDashboardClientHost()
  const terminalInput = useAppStore(
    useShallow((state) => {
      const tab = state.tabsByWorktree[workspaceId]?.find(
        (candidate) => candidate.id === target.tabId
      )
      return resolveDashboardCardTerminalInput(state, {
        ptyId: target.ptyId,
        worktreeId: workspaceId,
        paneKey: makePaneKey(target.tabId, target.leafId),
        cwd: tab?.startupCwd ?? workspacePath,
        shellOverride: tab?.shellOverride,
        launchAgent: tab?.launchAgent,
        clientPlatform: clientHost.platform,
        userAgent: clientHost.userAgent,
        osRelease: clientHost.osRelease
      })
    })
  )
  return (
    <AgentTerminalPreview
      ptyId={target.ptyId}
      terminalInput={terminalInput}
      className="h-auto min-h-0 flex-1"
    />
  )
}
