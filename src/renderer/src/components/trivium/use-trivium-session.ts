import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { deriveNotesSendAgentTargets } from '@/lib/notes-send-agent-targets'
import {
  activeAgentNotesSendFailureMessage,
  sendNotesToActiveAgentSession
} from '@/lib/active-agent-note-send'
import { selectLivePtyIdsForWorktree } from '@/components/sidebar/worktree-card-status-inputs'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { pickTriviumDefaultSessionTarget } from './trivium-new-session-targets'
import {
  EMPTY_TRIVIUM_SESSION,
  useTriviumSessionState,
  triviumSessionTargetKey
} from './trivium-session-state'

export function useTriviumSession(workspaceId: string, sessionKey: string) {
  const session = useTriviumSessionState((s) => s.sessions[sessionKey] ?? EMPTY_TRIVIUM_SESSION)
  const update = useTriviumSessionState((s) => s.update)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  const ptyIdsByTabId = useAppStore(useShallow((s) => selectLivePtyIdsForWorktree(s, workspaceId)))
  const runtimePaneTitlesByTabId = useAppStore((s) => s.runtimePaneTitlesByTabId)
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const targets = useMemo(() => {
    void agentStatusEpoch
    return deriveNotesSendAgentTargets(
      {
        agentStatusByPaneKey,
        tabsByWorktree,
        terminalLayoutsByTabId,
        ptyIdsByTabId,
        runtimePaneTitlesByTabId
      },
      workspaceId
    ).flatMap((target) => {
      const ptyId = terminalLayoutsByTabId[target.tabId]?.ptyIdsByLeafId?.[target.leafId]
      return ptyId ? [{ ...target, ptyId }] : []
    })
  }, [
    agentStatusByPaneKey,
    tabsByWorktree,
    terminalLayoutsByTabId,
    ptyIdsByTabId,
    runtimePaneTitlesByTabId,
    workspaceId,
    agentStatusEpoch
  ])

  function selectTarget(key: string): void {
    const target = targets.find((candidate) => triviumSessionTargetKey(candidate) === key)
    if (!target || session.sending) {
      return
    }
    const ptyId = terminalLayoutsByTabId[target.tabId]?.ptyIdsByLeafId?.[target.leafId]
    if (!ptyId) {
      return
    }
    update(sessionKey, {
      target: { tabId: target.tabId, leafId: target.leafId, ptyId, title: target.tabTitle },
      newSessionAgent: null,
      launchedTabId: null,
      error: null,
      notice: null
    })
  }

  function selectNewSession(agent: TuiAgent): void {
    if (session.sending) {
      return
    }
    update(sessionKey, { newSessionAgent: agent, launchedTabId: null, error: null, notice: null })
  }

  useEffect(() => {
    // Why: a session the composer started becomes the target, so follow-ups reach the same agent.
    const launched = session.launchedTabId
      ? targets.find((candidate) => candidate.tabId === session.launchedTabId)
      : undefined
    if (launched) {
      update(sessionKey, {
        target: {
          tabId: launched.tabId,
          leafId: launched.leafId,
          ptyId: launched.ptyId,
          title: launched.tabTitle
        },
        newSessionAgent: null,
        launchedTabId: null
      })
      return
    }
    if (session.target) {
      return
    }
    const activeTabId = useAppStore.getState().activeTabIdByWorktree[workspaceId]
    const activeLeafId = activeTabId ? terminalLayoutsByTabId[activeTabId]?.activeLeafId : null
    const target = pickTriviumDefaultSessionTarget(targets, activeTabId, activeLeafId)
    if (!target) {
      return
    }
    const ptyId = terminalLayoutsByTabId[target.tabId]?.ptyIdsByLeafId?.[target.leafId]
    if (ptyId) {
      update(sessionKey, {
        target: { tabId: target.tabId, leafId: target.leafId, ptyId, title: target.tabTitle }
      })
    }
  }, [
    session.target,
    session.launchedTabId,
    targets,
    terminalLayoutsByTabId,
    workspaceId,
    sessionKey,
    update
  ])

  const target = session.target
  const samePty =
    target &&
    terminalLayoutsByTabId[target.tabId]?.ptyIdsByLeafId?.[target.leafId] === target.ptyId &&
    ptyIdsByTabId[target.tabId]?.includes(target.ptyId)
  const currentTarget = samePty
    ? targets.find(
        (candidate) => candidate.tabId === target.tabId && candidate.leafId === target.leafId
      )
    : undefined

  async function send(prompt: string): Promise<void> {
    const current = useTriviumSessionState.getState().sessions[sessionKey]
    if (!current?.target || current.sending || !prompt.trim()) {
      return
    }
    const pinned = current.target
    const state = useAppStore.getState()
    if (
      state.terminalLayoutsByTabId[pinned.tabId]?.ptyIdsByLeafId?.[pinned.leafId] !==
        pinned.ptyId ||
      !state.ptyIdsByTabId[pinned.tabId]?.includes(pinned.ptyId)
    ) {
      return
    }
    update(sessionKey, { sending: true, error: null, notice: null })
    try {
      const result = await sendNotesToActiveAgentSession({
        worktreeId: workspaceId,
        prompt,
        noteTarget: { tabId: pinned.tabId, leafId: pinned.leafId }
      })
      update(
        sessionKey,
        result.status === 'sent'
          ? { draft: '', sending: false }
          : {
              sending: false,
              error: activeAgentNotesSendFailureMessage(result.status, {
                explicitTarget: true,
                code: result.code
              })
            }
      )
    } catch {
      update(sessionKey, {
        sending: false,
        error: activeAgentNotesSendFailureMessage('status-unavailable')
      })
    }
  }

  return {
    session,
    targets,
    selectTarget,
    selectNewSession,
    send,
    previewPtyId: samePty ? target.ptyId : null,
    canSend: currentTarget?.status === 'eligible' && !session.sending,
    disabledReason: currentTarget?.disabledReason,
    update: (patch: Parameters<typeof update>[1]) => update(sessionKey, patch)
  }
}
