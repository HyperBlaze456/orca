import { useMemo } from 'react'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { translate } from '@/i18n/i18n'
import { launchAgentInNewTab, type LaunchAgentInNewTabResult } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import { DEFAULT_DISABLED_TUI_AGENTS } from '../../../../shared/tui-agent-selection'
import {
  buildTriviumNewSessionGroup,
  type TriviumNewSessionAgent,
  type TriviumNewSessionGroup
} from './trivium-new-session-targets'
import { useTriviumSessionState, type TriviumSession } from './trivium-session-state'

type LaunchOutcome = Pick<TriviumSession, 'error' | 'notice'> &
  Partial<Pick<TriviumSession, 'draft'>>

function couldNotStart(agent: string): LaunchOutcome {
  return {
    error: translate('trivium.composer.launchFailed', 'Could not start {{agent}}.', { agent }),
    notice: null
  }
}

async function settleLaunch(
  result: NonNullable<LaunchAgentInNewTabResult>,
  agent: string
): Promise<LaunchOutcome> {
  if (!result.promptDeliveryResult) {
    return {
      error: null,
      notice: translate('trivium.composer.launchStarted', 'Started {{agent}} in this workspace.', {
        agent
      }),
      // Why: without a delivery result, only a prompt folded into the launch command is known to
      // have reached the agent; a pending paste may still fail, so the draft stays.
      ...(result.pasteDraftAfterLaunch ? {} : { draft: '' })
    }
  }
  const delivered = await result.promptDeliveryResult.then(
    (delivery) => delivery.delivered,
    () => false
  )
  if (!delivered) {
    return {
      error: translate(
        'trivium.composer.launchNotDelivered',
        '{{agent}} started, but the request was not delivered. Check the new tab in this workspace.',
        { agent }
      ),
      notice: null
    }
  }
  return {
    error: null,
    notice: translate(
      'trivium.composer.launchSent',
      'Sent to {{agent}}. It runs in a new tab of this workspace.',
      { agent }
    ),
    draft: ''
  }
}

/**
 * Starts an agent as a regular terminal tab of the page's workspace, with the request as its first
 * prompt. The user stays on the Trivium page; the tab is found later like any tab-bar launch.
 */
export function useTriviumAgentLaunch(
  workspaceId: string,
  sessionKey: string
): {
  newSessionGroup: TriviumNewSessionGroup
  launch: (option: TriviumNewSessionAgent, prompt: string) => Promise<void>
} {
  const update = useTriviumSessionState((s) => s.update)
  // Why: an SSH or paired-runtime workspace lists the agents of the host that runs them.
  const detectionTarget = useAgentDetectionTargetForWorktree(workspaceId)
  const { detectedIds, detectionFailed } = useDetectedAgents(detectionTarget)
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent)
  const disabledAgents = useAppStore(
    (s) => s.settings?.disabledTuiAgents ?? DEFAULT_DISABLED_TUI_AGENTS
  )
  const newSessionGroup = useMemo(
    () =>
      buildTriviumNewSessionGroup({ detectedIds, detectionFailed, defaultAgent, disabledAgents }),
    [detectedIds, detectionFailed, defaultAgent, disabledAgents]
  )

  async function launch(option: TriviumNewSessionAgent, prompt: string): Promise<void> {
    const current = useTriviumSessionState.getState().sessions[sessionKey]
    if (current?.sending || !prompt.trim()) {
      return
    }
    const agent = option.label
    update(sessionKey, {
      sending: true,
      error: null,
      notice: translate('trivium.composer.starting', 'Starting {{agent}}…', { agent })
    })
    let result: LaunchAgentInNewTabResult = null
    try {
      const groupId = useAppStore.getState().activeGroupIdByWorktree[workspaceId]
      result = launchAgentInNewTab({
        agent: option.agent,
        worktreeId: workspaceId,
        ...(groupId ? { groupId } : {}),
        prompt,
        promptDelivery: 'submit-after-ready'
      })
    } catch (error) {
      console.error('Trivium composer could not start an agent session', error)
    }
    if (!result) {
      update(sessionKey, { sending: false, ...couldNotStart(agent) })
      return
    }
    if (result.surface.kind !== 'host-published') {
      update(sessionKey, { launchedTabId: result.surface.tabId })
    }
    update(sessionKey, { sending: false, ...(await settleLaunch(result, agent)) })
  }

  return { newSessionGroup, launch }
}
