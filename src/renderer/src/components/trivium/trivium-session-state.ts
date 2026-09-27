import { create } from 'zustand'
import type { ActiveTerminalNoteTarget } from '@/lib/active-agent-note-target'
import type { TuiAgent } from '../../../../shared/tui-agent'

export type TriviumSessionTarget = ActiveTerminalNoteTarget & { ptyId: string; title: string }

export function triviumSessionTargetKey(
  target: ActiveTerminalNoteTarget & { ptyId: string }
): string {
  return JSON.stringify([target.tabId, target.leafId, target.ptyId])
}
export type TriviumSession = {
  target: TriviumSessionTarget | null
  /** Agent the user picked for a new session; wins over `target` until a session is picked. */
  newSessionAgent: TuiAgent | null
  /** Tab the composer started; becomes `target` once its agent shows up as a session. */
  launchedTabId: string | null
  selectedId: string | null
  draft: string
  sending: boolean
  error: string | null
  /** What the last new-session launch did, for the composer note. */
  notice: string | null
}

export const EMPTY_TRIVIUM_SESSION: TriviumSession = {
  target: null,
  newSessionAgent: null,
  launchedTabId: null,
  selectedId: null,
  draft: '',
  sending: false,
  error: null,
  notice: null
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
