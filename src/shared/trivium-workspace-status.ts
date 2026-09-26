/**
 * The Trivium Track A `workspace-status` projection, as defined by
 * `docs/track-a/WORKSPACE-BRIDGE.md` §3 in the trivium repository. Field names stay
 * snake_case because they are the wire payload, not a renderer-owned shape.
 */

/** The eight workspace states, in the precedence order §3 resolves them. */
export type TriviumWorkspaceState =
  | 'no-harness'
  | 'no-adopted-goal'
  | 'goal-draft'
  | 'escalated'
  | 'paused'
  | 'active'
  | 'review'
  | 'runnable'

export type TriviumGoalTier = 'g0' | 'g1' | 'g2' | 'g3'
/** Open: a status a newer trivium adds passes through as a plain string. */
export type TriviumGoalStatus =
  | 'adopted'
  | 'anticipated'
  | 'candidate'
  | 'rejected'
  | 'retired'
  | 'replaced'
  | (string & {})
export type TriviumGoalRelation = 'contributes-to' | 'depends-on'

export type TriviumGoalNode = {
  id: string
  tier: TriviumGoalTier
  title: string
  statement: string
  status: TriviumGoalStatus
}

export type TriviumGoalEdge = {
  id: string
  /** Canonical storage direction: `source` is the child, `target` the parent. */
  source: string
  target: string
  relation: TriviumGoalRelation
}

export type TriviumGoals = {
  counts: Record<TriviumGoalTier, number>
  normative: number
  adopted_normative: number
  candidates_to_approve: number
  nodes: TriviumGoalNode[]
  edges: TriviumGoalEdge[]
}

export type TriviumInterviewTrack = 'goal' | 'theory'

export type TriviumInterview = {
  id: string
  track: TriviumInterviewTrack
  phase: string
  created_at: string
}

/** Open: the status projection names four phases, the progress projection all seven. */
export type TriviumCampaignPhase =
  | 'started'
  | 'active'
  | 'paused'
  | 'milestone-reached'
  | 'milestone-recorded'
  | 'milestone-synthesized'
  | 'milestone-closed'
  | (string & {})

export type TriviumCampaign = {
  campaign_id: string
  goal_id: string
  phase: TriviumCampaignPhase
  pause_code: string | null
  current_feature: string | null
  holder: string | null
  generation: number
}

export type TriviumMilestone = {
  campaign_id: string
  summary: string
  unknowns: number
  contradictions: number
  promotion_candidates: number
}

export type TriviumEscalation = {
  feature_id: string
  intent_id: string
  reasons: string[]
}

export type TriviumTicketState = 'open' | 'in-progress' | 'blocked' | 'done' | 'abandoned'

export type TriviumTicketCandidate = {
  id: string
  title: string
  parent: string
  approve_command: string
}

export type TriviumTickets = {
  by_state: Record<TriviumTicketState, number>
  candidates: TriviumTicketCandidate[]
}

export type TriviumPublication = {
  event_id: string
  model_revision: string
}

export type TriviumHistory = {
  campaigns: number
  features: number
  publications: number
}

export type TriviumWorkspaceStatus = {
  schema_version: number
  kind: 'workspace-status'
  requested_path: string
  harness_root: string | null
  repository_root: string | null
  is_worker_worktree: boolean
  state: TriviumWorkspaceState
  state_reason: string
  publication: TriviumPublication | null
  goals: TriviumGoals
  theory_nodes: number
  interviews: TriviumInterview[]
  campaigns: { open: TriviumCampaign[]; closed: number }
  milestone: TriviumMilestone | null
  escalations: TriviumEscalation[]
  tickets: TriviumTickets
  history: TriviumHistory
  warnings: string[]
}

/** Why the execution host could answer but the trivium program could not run. */
export type TriviumUnavailable = {
  reason: string
  detail?: string
}

/**
 * A `{error}` reply from a living service (WORKSPACE-BRIDGE §4). It is a normal
 * answer carrying its own slug, not a transport failure.
 */
export type TriviumServiceError = {
  code: string
  message: string
}

/** The `trivium.status` envelope. `host` is the execution host that answered. */
export type TriviumStatusRpcResult =
  | ({
      supported: true
      host: string
      unavailable?: undefined
      serviceError?: undefined
    } & TriviumWorkspaceStatus)
  | { supported: false; host: string; reason: string }
  | {
      supported: true
      host: string
      unavailable: TriviumUnavailable
      serviceError?: undefined
    }
  | {
      supported: true
      host: string
      unavailable?: undefined
      serviceError: TriviumServiceError
    }

/** The `trivium.availability` envelope; the executable probe behind `trivium.status`. */
export type TriviumAvailabilityRpcResult = {
  available: boolean
  program?: string
  version?: string
  protocol?: number
  reason?: string
  detail?: string
}

export const TRIVIUM_TICKET_STATES: readonly TriviumTicketState[] = [
  'open',
  'in-progress',
  'blocked',
  'done',
  'abandoned'
]
