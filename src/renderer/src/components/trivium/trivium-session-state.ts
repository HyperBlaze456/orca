import { create } from 'zustand'
import type { ActiveTerminalNoteTarget } from '@/lib/active-agent-note-target'

export type TriviumSessionTarget = ActiveTerminalNoteTarget & { ptyId: string; title: string }

export function triviumSessionTargetKey(
  target: ActiveTerminalNoteTarget & { ptyId: string }
): string {
  return JSON.stringify([target.tabId, target.leafId, target.ptyId])
}
type TriviumSession = {
  target: TriviumSessionTarget | null
  selectedId: string | null
  draft: string
  sending: boolean
  error: string | null
}

export const EMPTY_TRIVIUM_SESSION: TriviumSession = {
  target: null,
  selectedId: null,
  draft: '',
  sending: false,
  error: null
}

// Retain the conversation target and draft when navigating away; never retain agent status.
export const useTriviumSessionState = create<{
  sessions: Record<string, TriviumSession>
  update: (key: string, patch: Partial<TriviumSession>) => void
}>((set) => ({
  sessions: {},
  update: (key, patch) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [key]: { ...(state.sessions[key] ?? EMPTY_TRIVIUM_SESSION), ...patch }
      }
    }))
}))
