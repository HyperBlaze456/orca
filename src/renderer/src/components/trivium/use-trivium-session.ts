import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { deriveNotesSendAgentTargets } from '@/lib/notes-send-agent-targets'
import {
  activeAgentNotesSendFailureMessage,
  sendNotesToActiveAgentSession
} from '@/lib/active-agent-note-send'
import { selectLivePtyIdsForWorktree } from '@/components/sidebar/worktree-card-status-inputs'
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
      error: null
    })
  }

  useEffect(() => {
    if (session.target) {
      return
    }
    const activeTabId = useAppStore.getState().activeTabIdByWorktree[workspaceId]
    const activeLeafId = activeTabId ? terminalLayoutsByTabId[activeTabId]?.activeLeafId : null
    const target =
      targets.find(
        (candidate) => candidate.tabId === activeTabId && candidate.leafId === activeLeafId
      ) ?? targets[0]
    if (!target) {
      return
    }
    const ptyId = terminalLayoutsByTabId[target.tabId]?.ptyIdsByLeafId?.[target.leafId]
    if (ptyId) {
      update(sessionKey, {
        target: { tabId: target.tabId, leafId: target.leafId, ptyId, title: target.tabTitle }
      })
    }
  }, [session.target, targets, terminalLayoutsByTabId, workspaceId, sessionKey, update])

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
    update(sessionKey, { sending: true, error: null })
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
    send,
    previewPtyId: samePty ? target.ptyId : null,
    canSend: currentTarget?.status === 'eligible' && !session.sending,
    disabledReason: currentTarget?.disabledReason,
    update: (patch: Parameters<typeof update>[1]) => update(sessionKey, patch)
  }
}
