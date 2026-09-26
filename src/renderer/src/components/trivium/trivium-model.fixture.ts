import type {
  TriviumGoalRelation,
  TriviumGoalTier,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import { buildTriviumModel, type TriviumModel, type TriviumModelInput } from './trivium-goal-model'
import {
  makeTriviumModelStatus,
  makeTriviumModelTicketRecords
} from './trivium-model-graph.fixture'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import type { TriviumFixtureBinary } from './trivium-model-tables.fixture'
import { readTriviumProgress } from './trivium-progress-records'
import { readTriviumTickets } from './trivium-ticket-records'

/** The three projections of the real-shaped fixture, decoded as the page decodes them. */
export function makeTriviumModelInput(binary: TriviumFixtureBinary = 'head'): TriviumModelInput {
  return {
    status: makeTriviumModelStatus(),
    tickets: readTriviumTickets({ tickets: makeTriviumModelTicketRecords(binary) }),
    progress: readTriviumProgress(makeTriviumModelProgress(binary))
  }
}

export function makeTriviumFixtureModel(binary: TriviumFixtureBinary = 'head'): TriviumModel {
  return buildTriviumModel(makeTriviumModelInput(binary))
}

/**
 * A small status payload for edge cases: `[id, tier, status]` nodes and `[source, target,
 * relation?]` edges (contribution by default); no candidates and no milestone.
 */
export function makeSmallTriviumStatus(
  nodes: [string, TriviumGoalTier, string][],
  edges: [string, string, TriviumGoalRelation?][]
): TriviumWorkspaceStatus {
  const status = makeTriviumModelStatus()
  status.goals.nodes = nodes.map(([id, tier, nodeStatus]) => ({
    id,
    tier,
    title: `Title of ${id}`,
    statement: '',
    status: nodeStatus
  }))
  status.goals.edges = edges.map(([source, target, relation = 'contributes-to'], index) => ({
    id: `edge.${index}`,
    source,
    target,
    relation
  }))
  status.tickets.candidates = []
  status.milestone = null
  return status
}
