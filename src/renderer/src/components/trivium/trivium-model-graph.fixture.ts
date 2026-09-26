import type {
  TriviumGoalEdge,
  TriviumGoalNode,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import {
  FIXTURE_CAMPAIGNS,
  FIXTURE_GOALS,
  FIXTURE_REVIEW_CAMPAIGN,
  FIXTURE_ROOT,
  FIXTURE_TICKETS,
  fixtureApproveCommand,
  fixtureFeatureId,
  fixtureHex,
  fixtureMilestoneSummary,
  type TriviumFixtureBinary
} from './trivium-model-tables.fixture'
import { fixtureProse } from './trivium-model-text.fixture'

// The `trivium.status` and `trivium.tickets` payloads of the real-shaped fixture harness.

const slugOf = (id: string): string => id.slice(id.indexOf('.') + 1)
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1)

function makeGraph(): { nodes: TriviumGoalNode[]; edges: TriviumGoalEdge[] } {
  const goals: TriviumGoalNode[] = FIXTURE_GOALS.map((goal, index) => ({
    id: goal.id,
    tier: goal.tier,
    title: goal.title,
    statement: fixtureProse(index * 5, goal.length),
    status: 'adopted'
  }))
  const tickets: TriviumGoalNode[] = FIXTURE_TICKETS.map((row, index) => ({
    id: row.id,
    tier: 'g3',
    title: row.title,
    statement: fixtureProse(index * 3 + 1, row.length),
    status: row.candidate ? 'candidate' : 'adopted'
  }))
  const edges: TriviumGoalEdge[] = []
  const link = (source: string, target: string, relation: TriviumGoalEdge['relation']): void => {
    edges.push({
      id: `goal-edge.${slugOf(source)}.${relation}.${slugOf(target)}`,
      source,
      target,
      relation
    })
  }
  for (const row of [...FIXTURE_GOALS, ...FIXTURE_TICKETS]) {
    if (row.parent) {
      link(row.id, row.parent, 'contributes-to')
    }
  }
  for (const row of FIXTURE_TICKETS) {
    for (const target of row.dependsOn) {
      link(row.id, target, 'depends-on')
    }
  }
  return { nodes: [...goals, ...tickets].sort(byId), edges: edges.sort(byId) }
}

export function makeTriviumModelStatus(): TriviumWorkspaceStatus {
  const { nodes, edges } = makeGraph()
  const review = FIXTURE_CAMPAIGNS.find((campaign) => campaign.id === FIXTURE_REVIEW_CAMPAIGN)
  return {
    schema_version: 1,
    kind: 'workspace-status',
    requested_path: FIXTURE_ROOT,
    harness_root: FIXTURE_ROOT,
    repository_root: FIXTURE_ROOT,
    is_worker_worktree: false,
    state: 'review',
    state_reason: `Campaign ${FIXTURE_REVIEW_CAMPAIGN} synthesized a milestone with 3 unknown(s) and 1 promotion candidate(s)`,
    publication: {
      event_id: `event.${fixtureHex('event', 64)}`,
      model_revision: `sha256:${fixtureHex('revision', 64)}`
    },
    goals: {
      counts: { g0: 1, g1: 2, g2: 1, g3: 14 },
      normative: 4,
      adopted_normative: 4,
      candidates_to_approve: 3,
      nodes,
      edges
    },
    theory_nodes: 49,
    interviews: [
      {
        id: 'interview.notes-scope',
        track: 'goal',
        phase: 'goal-drafted',
        created_at: '2026-09-13T14:23:10+00:00'
      },
      {
        id: 'interview.sync-tracks',
        track: 'goal',
        phase: 'goal-reviewed',
        created_at: '2026-09-13T14:47:14+00:00'
      }
    ],
    campaigns: { open: [], closed: 4 },
    milestone: {
      campaign_id: FIXTURE_REVIEW_CAMPAIGN,
      summary: review ? fixtureMilestoneSummary(review) : '',
      unknowns: 3,
      contradictions: 2,
      promotion_candidates: 1
    },
    escalations: [],
    tickets: {
      by_state: { open: 1, 'in-progress': 0, blocked: 0, done: 13, abandoned: 0 },
      candidates: FIXTURE_TICKETS.filter((row) => row.candidate).map((row) => ({
        id: row.id,
        title: row.title,
        parent: row.parent,
        approve_command: fixtureApproveCommand(row.id)
      }))
    },
    history: { campaigns: 6, features: 21, publications: 22 },
    warnings: []
  }
}

/** `trivium.tickets` rows; the installed binary does not send `approve`. */
export function makeTriviumModelTicketRecords(
  binary: TriviumFixtureBinary = 'head'
): Record<string, unknown>[] {
  const statements = new Map(makeGraph().nodes.map((node) => [node.id, node.statement]))
  return FIXTURE_TICKETS.map((row) => ({
    ...(binary === 'head' ? { approve: row.candidate ? fixtureApproveCommand(row.id) : null } : {}),
    awaiting: row.candidate ? 'approve' : null,
    blocks: 0,
    depends_on: row.dependsOn.toSorted(),
    features: row.onRecord
      ? [{ feature_id: fixtureFeatureId(row.id), merged_commit: fixtureHex(row.id) }]
      : [],
    id: row.id,
    parent: row.parent,
    paths: Array.from(
      { length: row.paths },
      (_, index) => `src/notes/${slugOf(row.id)}/part-${index}.ts`
    ),
    state: row.state,
    statement: statements.get(row.id) ?? '',
    status: row.candidate ? 'candidate' : 'adopted',
    title: row.title
  })).sort(byId)
}
