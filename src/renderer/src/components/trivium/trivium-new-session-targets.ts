import {
  buildTabAgentLaunchOptions,
  orderTabLaunchAgents
} from '@/components/tab-bar/tab-agent-launch-options'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { triviumSessionTargetKey } from './trivium-session-state'

/** An agent the composer can start a new session of; `key` is its select value. */
export type TriviumNewSessionAgent = { agent: TuiAgent; label: string; key: string }

/** The composer's "New session" group: startable agents, or why there are none yet. */
export type TriviumNewSessionGroup =
  | { state: 'detecting' }
  | { state: 'none' }
  | { state: 'ready'; agents: TriviumNewSessionAgent[] }

export type TriviumComposerSessionItem = { key: string; label: string }

export type TriviumComposerNewSessionItem =
  | { kind: 'agent'; key: string; agent: TuiAgent; label: string }
  | { kind: 'detecting' | 'none'; key: string }

type TriviumSessionCandidate = {
  tabId: string
  leafId: string
  ptyId: string
  tabTitle: string
}

// Why: session keys are JSON arrays, so neither prefix can collide with one.
const NEW_SESSION_KEY_PREFIX = 'new:'
const NEW_SESSION_STATUS_KEY_PREFIX = 'new-status:'

export function triviumNewSessionKey(agent: TuiAgent): string {
  return `${NEW_SESSION_KEY_PREFIX}${agent}`
}

/** Enabled detected agents, the user's default first (the tab-bar quick-launch order). */
export function buildTriviumNewSessionGroup(args: {
  detectedIds: readonly TuiAgent[] | null
  detectionFailed?: boolean
  defaultAgent: TuiAgent | 'blank' | null | undefined
  disabledAgents: Iterable<unknown> | null | undefined
}): TriviumNewSessionGroup {
  if (args.detectedIds === null) {
    return args.detectionFailed ? { state: 'none' } : { state: 'detecting' }
  }
  const ordered = orderTabLaunchAgents(args.defaultAgent, args.detectedIds, args.disabledAgents)
  if (ordered.length === 0) {
    return { state: 'none' }
  }
  return {
    state: 'ready',
    agents: buildTabAgentLaunchOptions(ordered).map(({ agent, label }) => ({
      agent,
      label,
      key: triviumNewSessionKey(agent)
    }))
  }
}

/** Select entries in order: existing sessions (unchanged), then the "New session" group. */
export function buildTriviumComposerTargetItems(
  sessions: readonly TriviumSessionCandidate[],
  group: TriviumNewSessionGroup
): { sessions: TriviumComposerSessionItem[]; newSession: TriviumComposerNewSessionItem[] } {
  return {
    sessions: sessions.map((session) => ({
      key: triviumSessionTargetKey(session),
      label: session.tabTitle
    })),
    newSession:
      group.state === 'ready'
        ? group.agents.map((option): TriviumComposerNewSessionItem => ({
            kind: 'agent',
            ...option
          }))
        : [{ kind: group.state, key: `${NEW_SESSION_STATUS_KEY_PREFIX}${group.state}` }]
  }
}

export function findTriviumNewSessionAgent(
  group: TriviumNewSessionGroup,
  key: string
): TriviumNewSessionAgent | undefined {
  return group.state === 'ready' ? group.agents.find((option) => option.key === key) : undefined
}

/**
 * The new session Send would start, or null when Send goes to an existing session. The user's pick
 * wins while that agent is still offered; with no session to send to, the first agent (the default)
 * is preselected.
 */
export function resolveTriviumNewSessionChoice(args: {
  chosen: TuiAgent | null
  hasSessions: boolean
  group: TriviumNewSessionGroup
}): TriviumNewSessionAgent | null {
  if (args.group.state !== 'ready') {
    return null
  }
  const picked = args.chosen
    ? args.group.agents.find((option) => option.agent === args.chosen)
    : undefined
  if (picked) {
    return picked
  }
  return args.hasSessions ? null : (args.group.agents[0] ?? null)
}

/** Default existing session: the workspace's active pane, else the first session. */
export function pickTriviumDefaultSessionTarget<T extends { tabId: string; leafId: string }>(
  targets: readonly T[],
  activeTabId: string | null | undefined,
  activeLeafId: string | null | undefined
): T | undefined {
  return (
    targets.find(
      (candidate) => candidate.tabId === activeTabId && candidate.leafId === activeLeafId
    ) ?? targets[0]
  )
}
