// Mirrors the object `trivium view progress --verbose` prints (trivium/view/progress.py):
// Feature work is bucketed by result under its adopted Goal, campaigns carry four fields,
// and the milestone narrative is split into summary, drift, trade-offs and candidates.
export function makeTriviumProgressRecord(): Record<string, unknown> {
  const episode = (outcome: string, commit: string) => ({
    outcome,
    decisions: [],
    evidence_ids: [],
    memory_delta: { added: 2, suspect: 0, superseded: 0, revalidated: 4, invalid: 0 },
    merged_commit: commit,
    summary: `Campaign campaign.uploads drove a Feature to completed: 0 A2-boundary intervention(s).`
  })
  const ticket = (id: string, title: string, state: string, candidate = false) => ({
    ticket_id: `ticket.${id}`,
    title,
    status: candidate ? 'candidate' : 'adopted',
    state,
    blocks: 0,
    awaiting: candidate ? 'approve' : null,
    approve: candidate
      ? `trivium model ticket approve ticket.${id} --approved-by <user> --yes`
      : null,
    features: []
  })
  return {
    schema_version: 1,
    kind: 'progress',
    model_revision: 'sha256:fedcba9876543210',
    theory_authority: { milestone: 2, promoted: 5 },
    goals: [
      {
        goal_id: 'goal.outcome',
        tier: 'g1',
        title: 'Resume interrupted uploads',
        tickets: [],
        completed: [
          {
            feature_id: 'feature.checkpoint',
            title: 'Persist upload checkpoints',
            result: 'completed',
            ticket: 'ticket.checkpoint',
            episode: episode(
              'A checkpoint file is written after every confirmed chunk.',
              'abc123def4567890'
            )
          },
          {
            feature_id: 'feature.detect',
            title: 'Detect interrupted uploads',
            result: 'completed',
            ticket: 'ticket.detect',
            episode: episode('', '0123456789abcdef')
          }
        ],
        abandoned: [],
        in_progress: [
          {
            feature_id: 'feature.resume',
            title: 'Resume from the last confirmed chunk',
            result: 'in-progress',
            ticket: 'ticket.resume'
          }
        ],
        queued: [
          {
            feature_id: 'feature.limits',
            title: 'Define retry limits',
            result: 'queued',
            ticket: 'ticket.limits'
          }
        ],
        deduplicated: [],
        blocked: [
          {
            feature_id: 'feature.expired',
            title: 'Handle expired upload tokens',
            result: 'blocked',
            ticket: 'ticket.expired',
            blocker: 'ticket.resume'
          }
        ],
        derived_outcomes: [],
        milestones: [
          {
            campaign_id: 'campaign.uploads',
            proposal_id: 'proposal.uploads.milestone.1',
            summary: 'Checkpoints landed; retry policy is unverified.',
            drift: ['The Campaign anchored the G1 outcome directly instead of a G2 capability.'],
            trade_offs: ['Retry limits stay a candidate until the token refresh path is known.'],
            promotion_candidates: ['mechanism.checkpoint-after-confirmed-chunk'],
            node_ids: [
              'behavior.checkpoint-survives-drop',
              'mechanism.checkpoint-after-confirmed-chunk'
            ]
          }
        ],
        unknowns: [
          { campaign_id: 'campaign.uploads', text: 'What happens after the retry limit?' },
          { campaign_id: 'campaign.uploads', text: 'Can expired sessions be resumed?' },
          { campaign_id: 'campaign.uploads', text: 'How should partial uploads be reported?' }
        ]
      },
      {
        goal_id: 'goal.retry',
        tier: 'g2',
        title: 'Retry policy',
        tickets: [
          ticket('retry', 'Retry the last chunk once', 'in-progress'),
          ticket('limits', 'Define retry limits', 'open', true)
        ],
        completed: [],
        abandoned: [],
        in_progress: [],
        queued: [],
        deduplicated: [],
        blocked: [],
        derived_outcomes: [],
        milestones: [],
        unknowns: []
      },
      {
        goal_id: 'goal.purpose',
        tier: 'g0',
        title: 'Ship uploads that survive flaky networks',
        tickets: [],
        completed: [],
        abandoned: [],
        in_progress: [],
        queued: [],
        deduplicated: [],
        blocked: [],
        derived_outcomes: [],
        milestones: [],
        unknowns: []
      }
    ],
    memory_delta: {
      current: { invalid: 0, superseded: 3, suspect: 1, valid: 12 },
      campaigns: { added: 5, invalid: 0, revalidated: 9, superseded: 0, suspect: 1 },
      representative: {
        added: [
          {
            id: 'memory.feature-advances-goal.checkpoint',
            relation: 'feature-advances-goal',
            subject: 'feature.checkpoint',
            object: 'goal.persistence',
            status: 'valid'
          }
        ],
        suspect: [
          {
            id: 'memory.evidence-supports-statement.retry',
            relation: 'evidence-supports-statement',
            subject: 'evidence.retry.run',
            object: 'memory.retry-once',
            status: 'suspect'
          }
        ]
      }
    },
    conflicts: [
      {
        kind: 'contradiction',
        campaign_id: 'campaign.uploads',
        proposal_id: 'proposal.uploads.milestone.1',
        text: 'The Theory says a retry never reuses an expired token, but the second Feature retried with one.'
      },
      {
        kind: 'contradiction',
        campaign_id: 'campaign.uploads',
        proposal_id: 'proposal.uploads.milestone.1',
        text: 'Checksum validation is described as pre-merge, but it ran after the merge.'
      }
    ],
    campaigns: [
      {
        campaign_id: 'campaign.uploads',
        goal_id: 'goal.outcome',
        phase: 'milestone-synthesized',
        current_feature: null
      }
    ],
    micro: [
      {
        campaign_id: 'campaign.uploads',
        consumed: { bytes_read: 0, file_reads: 10, llm_calls: 42, tokens: 120_000, tool_calls: 30 },
        boundaries: []
      }
    ]
  }
}
