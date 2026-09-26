import {
  FIXTURE_CAMPAIGNS,
  FIXTURE_GOALS,
  FIXTURE_TICKETS,
  G0,
  G1_SEARCH,
  G1_SYNC,
  G2,
  fixtureApproveCommand,
  fixtureFeatureId,
  fixtureHex,
  fixtureMilestoneSummary,
  type FixtureCampaignRow,
  type FixtureGoalRow,
  type TriviumFixtureBinary
} from './trivium-model-tables.fixture'
import { fixtureProse, fixtureTheoryId } from './trivium-model-text.fixture'

// Mirrors `trivium view progress` (trivium/view/progress.py). HEAD repeats tickets, Features,
// derived outcomes, milestones and unknowns on every ancestor Goal and adds `recorded_work`,
// `outcome` and `assessment`; the installed 0.15 lists each only on the Goal it anchors on.

/** The real harness's recorded work, per Goal of the same position. */
const RECORDED_WORK: Record<string, [number, number, number, string]> = {
  // completed features, completed tickets, outstanding tickets, delivery
  [G0]: [16, 13, 1, 'in-progress'],
  [G1_SYNC]: [10, 10, 0, 'delivered'],
  [G1_SEARCH]: [3, 3, 1, 'in-progress'],
  [G2]: [10, 10, 0, 'delivered']
}

type FeatureRow = {
  id: string
  title: string
  ticketId: string | null
  campaign: FixtureCampaignRow
  anchor: string
  /** Why the Feature proposed its ticket; `ratify` is the pre-rename spelling. */
  derived: { approve: string } | null
}

const FEATURES: FeatureRow[] = FIXTURE_CAMPAIGNS.flatMap((campaign) => [
  ...FIXTURE_TICKETS.filter((row) => row.campaign === campaign.id).map((row) => ({
    id: fixtureFeatureId(row.id),
    title: row.title,
    ticketId: row.id,
    campaign,
    anchor: row.parent,
    derived:
      row.parent === G1_SEARCH
        ? { approve: fixtureApproveCommand(row.id, 'ratify') }
        : row.candidate
          ? { approve: fixtureApproveCommand(row.id) }
          : null
  })),
  ...campaign.looseFeatures.map((id, index) => ({
    id,
    title: fixtureProse(index + 7, 60),
    ticketId: null,
    campaign,
    anchor: campaign.goalId,
    derived: { approve: 'milestone review' }
  }))
])

// Seeded per Feature, not per list position: trivium repeats one dict on every Goal listing it.
const seedOf = (feature: FeatureRow): number => FEATURES.indexOf(feature)

function ancestry(goalId: string): string[] {
  const goal = FIXTURE_GOALS.find((row) => row.id === goalId)
  return goal ? [goal.id, ...(goal.parent ? ancestry(goal.parent) : [])] : []
}

function episode(feature: FeatureRow, seed: number): Record<string, unknown> {
  return {
    outcome: fixtureProse(seed, 320),
    decisions: [],
    evidence_ids: [],
    memory_delta: { added: 2, suspect: 0, superseded: 0, revalidated: 4, invalid: 0 },
    merged_commit: fixtureHex(feature.ticketId ?? feature.id),
    summary: `Campaign ${feature.campaign.id} drove a Feature to completed: 0 A2-boundary intervention(s).`
  }
}

function milestone(campaign: FixtureCampaignRow): Record<string, unknown> {
  const seed = FIXTURE_CAMPAIGNS.indexOf(campaign) * 5
  const counts = campaign.milestone
  const slug = campaign.id.replace('campaign.', '')
  return {
    campaign_id: campaign.id,
    proposal_id: `proposal.${slug}.milestone.1`,
    summary: fixtureMilestoneSummary(campaign),
    drift: Array.from({ length: counts?.drift ?? 0 }, (_, i) => fixtureProse(seed + i, 240)),
    trade_offs: Array.from({ length: counts?.tradeOffs ?? 0 }, (_, i) =>
      fixtureProse(seed + i + 9, 180)
    ),
    promotion_candidates: Array.from({ length: counts?.promotions ?? 0 }, (_, i) =>
      fixtureTheoryId(i % 2 ? 'mechanism' : 'invariant', seed + i)
    ),
    node_ids: [fixtureTheoryId('behavior', seed), fixtureTheoryId('element', seed + 1)]
  }
}

function unknowns(campaign: FixtureCampaignRow): { campaign_id: string; text: string }[] {
  const seed = FIXTURE_CAMPAIGNS.indexOf(campaign) * 11
  return (campaign.milestone?.unknowns ?? []).map((length, i) => ({
    campaign_id: campaign.id,
    text: fixtureProse(seed + i * 2 + 5, length)
  }))
}

function goalEntry(goal: FixtureGoalRow, binary: TriviumFixtureBinary) {
  const inScope = (anchor: string): boolean =>
    binary === 'head' ? ancestry(anchor).includes(goal.id) : anchor === goal.id
  const features = FEATURES.filter((feature) => inScope(feature.anchor))
  const milestones = FIXTURE_CAMPAIGNS.filter((row) => row.milestone && inScope(row.goalId))
  const [completedFeatures, completedTickets, outstandingTickets, delivery] = RECORDED_WORK[goal.id]
  return {
    goal_id: goal.id,
    tier: goal.tier,
    title: goal.title,
    ...(binary === 'head'
      ? {
          recorded_work: {
            abandoned_features: 0,
            completed_features: completedFeatures,
            completed_tickets: completedTickets,
            delivery,
            open_features: 0,
            outstanding_tickets: outstandingTickets,
            source: 'recorded-work'
          },
          outcome: 'unassessed',
          assessment: null
        }
      : {}),
    tickets: FIXTURE_TICKETS.filter((row) => inScope(row.parent))
      .toSorted((a, b) => (a.id < b.id ? -1 : 1))
      .map((row) => ({
        approve: row.candidate ? fixtureApproveCommand(row.id) : null,
        awaiting: row.candidate ? 'approve' : null,
        blocks: 0,
        features: row.campaign
          ? [
              {
                campaign_id: row.campaign,
                feature_id: fixtureFeatureId(row.id),
                result: 'completed'
              }
            ]
          : [],
        state: row.state,
        status: row.candidate ? 'candidate' : 'adopted',
        ticket_id: row.id,
        title: row.title
      })),
    completed: features.map((feature) => ({
      feature_id: feature.id,
      title: feature.title,
      result: 'completed',
      ticket: feature.ticketId,
      episode: episode(feature, seedOf(feature) + 3)
    })),
    abandoned: [],
    in_progress: [],
    queued: [],
    deduplicated: [],
    blocked: [],
    derived_outcomes: features.flatMap((feature) =>
      feature.derived
        ? [
            {
              feature_id: feature.id,
              narrows: feature.anchor,
              tier: FIXTURE_GOALS.find((row) => row.id === feature.anchor)?.tier ?? 'g3',
              hypothesis: fixtureProse(seedOf(feature) + 12, 260),
              ticket_id: feature.ticketId,
              approve: feature.derived.approve
            }
          ]
        : []
    ),
    milestones: milestones.map(milestone),
    unknowns: milestones.flatMap(unknowns)
  }
}

/** The `trivium.progress` payload as repo HEAD or the installed 0.15 binary sends it. */
export function makeTriviumModelProgress(
  binary: TriviumFixtureBinary = 'head'
): Record<string, unknown> {
  return {
    schema_version: 1,
    kind: 'progress',
    model_revision: `sha256:${fixtureHex('revision', 64)}`,
    theory_authority: { milestone: 35, promoted: 14 },
    goals: FIXTURE_GOALS.toSorted((a, b) => (a.id < b.id ? -1 : 1)).map((goal) =>
      goalEntry(goal, binary)
    ),
    memory_delta: {
      campaigns: { added: 620, invalid: 6, revalidated: 1520, superseded: 0, suspect: 1136 },
      current: { invalid: 56, superseded: 1929, suspect: 25, valid: 934 },
      representative: {
        added: [0, 1, 2].map((i) => ({
          id: `memory.decision-selected-approach.notes-${i}`,
          subject: `intent.${fixtureFeatureId(FIXTURE_TICKETS[i].id).replace('feature.', '')}`,
          relation: 'decision-selected-approach',
          object: fixtureProse(i + 4, 400),
          status: 'valid'
        })),
        suspect: [0, 1, 2].map((i) => ({
          id: `memory.evidence-supports-statement.notes-${i}`,
          subject: `evidence.notes-suite-${i}`,
          relation: 'evidence-supports-statement',
          object: `memory.decision-selected-approach.notes-${i}`,
          status: 'suspect'
        }))
      }
    },
    conflicts: FIXTURE_CAMPAIGNS.flatMap((campaign, index) =>
      (campaign.milestone?.contradictions ?? []).map((length, i) => ({
        kind: 'contradiction',
        campaign_id: campaign.id,
        proposal_id: `proposal.${campaign.id.replace('campaign.', '')}.milestone.1`,
        text: fixtureProse(index * 13 + i * 3 + 9, length)
      }))
    ),
    campaigns: FIXTURE_CAMPAIGNS.map((campaign) => ({
      campaign_id: campaign.id,
      current_feature: null,
      goal_id: campaign.goalId,
      phase: campaign.phase
    }))
  }
}
