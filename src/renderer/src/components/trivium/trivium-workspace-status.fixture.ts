import type { TriviumWorkspaceStatus } from '../../../../shared/trivium-workspace-status'

const APPROVE_COMMAND = 'trivium model ticket approve ticket.upload-retry'

export function makeTriviumStatus(): TriviumWorkspaceStatus {
  return {
    schema_version: 1,
    kind: 'workspace-status',
    requested_path: '/srv/acme',
    harness_root: '/srv/acme',
    repository_root: '/srv/acme',
    is_worker_worktree: false,
    state: 'review',
    state_reason: 'A milestone is waiting on your review.',
    publication: { event_id: 'event.0123456789abcdef', model_revision: 'sha256:fedcba9876543210' },
    goals: {
      counts: { g0: 1, g1: 1, g2: 0, g3: 1 },
      normative: 2,
      adopted_normative: 2,
      candidates_to_approve: 1,
      nodes: [
        {
          id: 'goal.purpose',
          tier: 'g0',
          title: 'Ship uploads that survive flaky networks',
          statement: 'Uploads finish or report why.',
          status: 'adopted'
        },
        {
          id: 'goal.outcome',
          tier: 'g1',
          title: 'Resume interrupted uploads',
          statement: 'A dropped connection resumes from the last chunk.',
          status: 'adopted'
        }
      ],
      edges: [
        {
          id: 'goal-edge.1',
          source: 'goal.outcome',
          target: 'goal.purpose',
          relation: 'contributes-to'
        }
      ]
    },
    theory_nodes: 28,
    interviews: [],
    campaigns: { open: [], closed: 4 },
    milestone: {
      campaign_id: 'campaign.uploads',
      summary: 'Three Features landed; retry policy is still unverified.',
      unknowns: 3,
      contradictions: 2,
      promotion_candidates: 1
    },
    escalations: [],
    tickets: {
      by_state: { open: 1, 'in-progress': 0, blocked: 0, done: 3, abandoned: 0 },
      candidates: [
        {
          id: 'ticket.upload-retry',
          title: 'Retry the last chunk once',
          parent: 'goal.outcome',
          approve_command: APPROVE_COMMAND
        }
      ]
    },
    history: { campaigns: 4, features: 9, publications: 12 },
    warnings: []
  }
}
