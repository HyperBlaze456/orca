import type {
  TriviumCampaignPhase,
  TriviumGoalTier,
  TriviumTicketState
} from '../../../../shared/trivium-workspace-status'
import { fixtureProse } from './trivium-model-text.fixture'

// The real-shaped harness behind the Trivium page fixtures: 1 G0, 2 G1, 1 G2 and 14 G3 (one
// with a `goal.` id), 12 depends-on edges, 3 candidate tickets and 6 Campaigns, in the
// proportions of the trivium repository's own harness but with neutral text.

/** Which binary produced a payload: repo HEAD, or the installed 0.15 without roll-ups. */
export type TriviumFixtureBinary = 'head' | 'installed'

export const FIXTURE_ROOT = '/srv/notes'
export const G0 = 'goal.notes-anywhere'
export const G1_SYNC = 'goal.dependable-sync'
export const G1_SEARCH = 'goal.shared-search'
export const G2 = 'goal.sync-first-slice'

export type FixtureGoalRow = {
  id: string
  tier: TriviumGoalTier
  title: string
  length: number
  parent: string | null
}

export type FixtureTicketRow = {
  id: string
  title: string
  length: number
  parent: string
  candidate: boolean
  state: TriviumTicketState
  dependsOn: string[]
  paths: number
  /** The Campaign whose Feature delivered it; null for work not started. */
  campaign: string | null
  /** `trivium.tickets` lists the Feature run (with its commit) on the record. */
  onRecord: boolean
}

export type FixtureMilestoneRow = {
  summary: number
  drift: number
  tradeOffs: number
  promotions: number
  unknowns: number[]
  contradictions: number[]
}

export type FixtureCampaignRow = {
  id: string
  goalId: string
  phase: TriviumCampaignPhase
  milestone: FixtureMilestoneRow | null
  /** Features anchored on the Campaign's Goal with no ticket. */
  looseFeatures: string[]
}

export const FIXTURE_GOALS: FixtureGoalRow[] = [
  { id: G0, tier: 'g0', title: 'Notes stay usable', length: 76, parent: null },
  {
    id: G1_SYNC,
    tier: 'g1',
    title: 'Sync keeps every confirmed edit and says plainly what it could not merge',
    length: 1240,
    parent: G0
  },
  {
    id: G2,
    tier: 'g2',
    title:
      '첫 동기화 단계: 오프라인에서 고친 노트가 다시 연결될 때 순서대로 합쳐진다 (first slice)',
    length: 1040,
    parent: G1_SYNC
  },
  {
    id: G1_SEARCH,
    tier: 'g1',
    title: 'Search와 export가 하나의 색인을 공유한다',
    length: 361,
    parent: G0
  }
]

const SLICE = 'campaign.sync-first-slice'
const REPAIR = 'campaign.sync-contradictions'
export const FIXTURE_REVIEW_CAMPAIGN = 'campaign.ticket-dogfood'
const CLEANUP = 'campaign.search-cleanup'

const TICKET_TITLES: Record<string, string> = {
  'ticket.sync-baseline':
    'Time a full sync of three sample libraries and file the numbers as a starting point',
  'ticket.sync-journal':
    'Each accepted merge appends one line to a local log that can be replayed in order',
  'ticket.sync-refresh':
    '앱을 다시 열면 동기화 상태 표시와 마지막 동기화 시각이 곧바로 새로 바뀐다',
  'ticket.sync-conflict-rules':
    '같은 줄을 두 기기에서 고치면 둘 다 보관하고 어느 쪽을 쓸지 묻는다 (conflict rules)',
  'ticket.sync-edit-history':
    'Show who accepted each merged change and when, right next to the paragraph it touched',
  'ticket.sync-size-budget':
    'One sync stays under a size cap; bigger attachments wait for an unmetered network',
  'ticket.sync-export': 'A notebook exported on one device opens on another with its tags intact',
  'ticket.sync-evaluation':
    'Run the same twenty sync scenarios every night and chart how long each of them takes',
  'ticket.export-cutoff':
    'A cancelled export deletes its half-written file and says where it stopped',
  'ticket.trim-keeps-marker':
    'Shortened previews end with a visible fold line, and tapping that line opens the whole note from the top',
  'ticket.index-reads-once': '첫 실행 뒤로는 search index를 처음부터 다시 만들지 않는다',
  'goal.export-write-check': 'export 파일 이름이 겹치면 덮어쓰기 전에 먼저 묻는다',
  'ticket.search-awaiting-view': 'Search results mark notes still waiting to sync',
  'ticket.search-overlap-check': 'A new saved search warns when an older one finds the same notes'
}

// id, parent, depends on, files, statement length, Campaign, flags: c candidate, r Feature on
// the record, o open. Queue order inside each Campaign: a dependency before its dependents.
const TICKET_ROWS: [string, string, string[], number, number, string | null, string][] = [
  ['ticket.sync-baseline', G2, [], 7, 756, SLICE, ''],
  ['ticket.sync-journal', G2, ['ticket.sync-baseline'], 6, 555, SLICE, ''],
  ['ticket.sync-refresh', G2, ['ticket.sync-baseline'], 5, 660, SLICE, ''],
  ['ticket.sync-conflict-rules', G2, ['ticket.sync-journal'], 12, 853, SLICE, ''],
  ['ticket.sync-edit-history', G2, ['ticket.sync-conflict-rules'], 12, 747, SLICE, ''],
  [
    'ticket.sync-size-budget',
    G2,
    ['ticket.sync-edit-history', 'ticket.sync-baseline'],
    16,
    879,
    SLICE,
    ''
  ],
  ['ticket.sync-export', G2, ['ticket.sync-edit-history'], 11, 761, SLICE, ''],
  [
    'ticket.sync-evaluation',
    G2,
    ['ticket.sync-export', 'ticket.sync-refresh', 'ticket.sync-size-budget'],
    30,
    1074,
    SLICE,
    ''
  ],
  ['ticket.export-cutoff', G2, ['ticket.sync-export'], 10, 436, REPAIR, 'c'],
  ['ticket.trim-keeps-marker', G2, ['ticket.sync-size-budget'], 8, 464, REPAIR, 'c'],
  ['ticket.index-reads-once', G1_SEARCH, [], 2, 250, CLEANUP, 'cr'],
  ['goal.export-write-check', G1_SEARCH, [], 0, 148, null, 'o'],
  ['ticket.search-awaiting-view', G1_SEARCH, [], 2, 186, FIXTURE_REVIEW_CAMPAIGN, 'r'],
  ['ticket.search-overlap-check', G1_SEARCH, [], 6, 217, FIXTURE_REVIEW_CAMPAIGN, 'r']
]

export const FIXTURE_TICKETS: FixtureTicketRow[] = TICKET_ROWS.map(
  ([id, parent, dependsOn, paths, length, campaign, flags]) => ({
    id,
    title: TICKET_TITLES[id] ?? id,
    length,
    parent,
    candidate: flags.includes('c'),
    state: flags.includes('o') ? 'open' : 'done',
    dependsOn,
    paths,
    campaign,
    onRecord: flags.includes('r')
  })
)

const milestone = (
  summary: number,
  counts: [drift: number, tradeOffs: number, promotions: number],
  unknowns: number[],
  contradictions: number[]
): FixtureMilestoneRow => ({
  summary,
  drift: counts[0],
  tradeOffs: counts[1],
  promotions: counts[2],
  unknowns,
  contradictions
})

export const FIXTURE_CAMPAIGNS: FixtureCampaignRow[] = [
  { id: CLEANUP, goalId: G1_SEARCH, phase: 'milestone-closed', milestone: null, looseFeatures: [] },
  {
    id: SLICE,
    goalId: G2,
    phase: 'milestone-synthesized',
    milestone: milestone(1040, [2, 5, 4], [191, 151, 167, 108], [284, 375, 215]),
    looseFeatures: []
  },
  {
    id: REPAIR,
    goalId: G2,
    phase: 'milestone-synthesized',
    milestone: milestone(928, [1, 4, 2], [130, 102], [283, 91]),
    looseFeatures: []
  },
  {
    id: 'campaign.offline-context',
    goalId: G0,
    phase: 'milestone-recorded',
    milestone: null,
    looseFeatures: ['feature.offline-notes-doc']
  },
  {
    id: 'campaign.self-hosted-pilot',
    goalId: G0,
    phase: 'milestone-synthesized',
    milestone: milestone(282, [1, 2, 1], [79, 59], [237]),
    looseFeatures: ['feature.orient-open-campaigns', 'feature.driver-guide-doc']
  },
  {
    id: FIXTURE_REVIEW_CAMPAIGN,
    goalId: G1_SEARCH,
    phase: 'milestone-synthesized',
    milestone: milestone(554, [2, 3, 1], [92, 49, 110], [150, 176]),
    looseFeatures: []
  }
]

/** A deterministic hex string: commits, revisions and event ids. */
export function fixtureHex(seed: string, length = 40): string {
  let hex = ''
  for (let round = 0; hex.length < length; round += 1) {
    let hash = 0x811c9dc5 ^ round
    for (const char of seed) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193)
    }
    hex += (hash >>> 0).toString(16).padStart(8, '0')
  }
  return hex.slice(0, length)
}

/** The milestone narrative a Campaign synthesized; the status projection repeats it. */
export function fixtureMilestoneSummary(campaign: FixtureCampaignRow): string {
  return fixtureProse(FIXTURE_CAMPAIGNS.indexOf(campaign) * 7 + 2, campaign.milestone?.summary ?? 0)
}

export function fixtureApproveCommand(id: string, verb = 'approve'): string {
  return `trivium model ticket ${verb} ${id} --approved-by <user> --yes`
}

export function fixtureFeatureId(ticketId: string): string {
  return `feature.${ticketId.replace(/^(?:ticket|goal)\./, '')}`
}
