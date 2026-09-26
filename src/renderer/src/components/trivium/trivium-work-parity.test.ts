import { describe, expect, it } from 'vitest'
import type {
  TriviumGoalEdge,
  TriviumGoalNode,
  TriviumGoalTier
} from '../../../../shared/trivium-workspace-status'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import {
  makeTriviumModelStatus,
  makeTriviumModelTicketRecords
} from './trivium-model-graph.fixture'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import { makeSmallTriviumStatus, makeTriviumModelInput } from './trivium-model.fixture'
import { readTriviumProgress } from './trivium-progress-records'
import { makeRandomTriviumGraph } from './trivium-random-graph.fixture'
import { readTriviumTickets } from './trivium-ticket-records'
import { isTriviumRecord } from './trivium-workspace-query'

type Work = { done: number; total: number }

/**
 * trivium/view/progress.py `_tickets` + `_recorded_work`, restated independently of the model:
 * a ticket counts under every non-ticket node its contributes-to ancestry reaches (through
 * nodes of any status); active = status not rejected/retired/replaced; done = state `done`.
 */
function triviumRecordedTickets(
  nodes: readonly TriviumGoalNode[],
  edges: readonly TriviumGoalEdge[],
  records: readonly Record<string, unknown>[]
): Map<string, Work> {
  const tiers = new Map(nodes.map((node) => [node.id, node.tier]))
  const parents = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.relation === 'contributes-to') {
      parents.set(edge.source, [...(parents.get(edge.source) ?? []), edge.target])
    }
  }
  const ancestry = (id: string): Set<string> => {
    const seen = new Set<string>()
    const frontier = [id]
    for (let next = frontier.pop(); next !== undefined; next = frontier.pop()) {
      if (!seen.has(next)) {
        seen.add(next)
        frontier.push(...(parents.get(next) ?? []))
      }
    }
    return seen
  }
  const work = new Map<string, Work>()
  for (const node of nodes) {
    if (node.tier !== 'g3') {
      continue
    }
    const record = records.find((item) => item.id === node.id)
    const active = !['rejected', 'retired', 'replaced'].includes(node.status)
    const done = record?.state === 'done'
    for (const anchor of ancestry(node.id)) {
      if (tiers.get(anchor) === 'g3' || !active) {
        continue
      }
      const current = work.get(anchor) ?? { done: 0, total: 0 }
      work.set(anchor, { done: current.done + (done ? 1 : 0), total: current.total + 1 })
    }
  }
  return work
}

function workOf(model: TriviumModel, id: string): Work {
  const { done, total } = model.work(id)
  return { done, total }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isTriviumRecord) : []
}

describe('work parity with trivium recorded_work (independent rule)', () => {
  const status = makeTriviumModelStatus()
  const rule = triviumRecordedTickets(
    status.goals.nodes,
    status.goals.edges,
    makeTriviumModelTicketRecords('head')
  )
  const headGoals = records(makeTriviumModelProgress('head').goals)

  it("the HEAD fixture's recorded_work is what trivium's rule gives on the fixture graph", () => {
    expect(headGoals).toHaveLength(4)
    for (const goal of headGoals) {
      const recorded = isTriviumRecord(goal.recorded_work) ? goal.recorded_work : {}
      const done = Number(recorded.completed_tickets)
      const outstanding = Number(recorded.outstanding_tickets)
      expect({ id: goal.goal_id, done, total: done + outstanding }).toEqual({
        id: goal.goal_id,
        ...rule.get(String(goal.goal_id))
      })
      // `completed_features` is the length of the Goal's (rolled-up) completed list.
      expect(recorded.completed_features).toBe(records(goal.completed).length)
    }
  })

  it('model.work equals the rule on HEAD, HEAD without recorded_work, and installed', () => {
    const head = makeTriviumModelInput('head')
    const variants = {
      head: buildTriviumModel(head),
      stripped: buildTriviumModel({
        ...head,
        progress: head.progress && {
          ...head.progress,
          goals: head.progress.goals.map((goal) => ({ ...goal, recordedWork: null }))
        }
      }),
      installed: buildTriviumModel(makeTriviumModelInput('installed'))
    }
    for (const goal of headGoals) {
      const id = String(goal.goal_id)
      const recorded = isTriviumRecord(goal.recorded_work) ? goal.recorded_work : {}
      for (const [name, model] of Object.entries(variants)) {
        expect({ name, id, ...workOf(model, id) }).toEqual({ name, id, ...rule.get(id) })
        expect({ name, id, features: model.work(id).completedFeatures }).toEqual({
          name,
          id,
          features: recorded.completed_features
        })
      }
    }
  })

  it('keeps recorded totals while ticket records load and derives totals from the graph', () => {
    const head = makeTriviumModelInput('head')
    const loadingHead = buildTriviumModel({ ...head, tickets: [] })
    const loadingInstalled = buildTriviumModel({ ...head, tickets: [], progress: null })
    for (const goal of headGoals) {
      const id = String(goal.goal_id)
      expect(workOf(loadingHead, id)).toEqual(rule.get(id))
      expect(loadingInstalled.work(id).total).toBe(rule.get(id)?.total)
    }
  })
})

describe('derived work on edge graphs', () => {
  // G0 ← G1(rejected) ← G2 ← tickets; G0 ← G1b ← t6 (also under G2); t8 contributes to t1.
  const nodes: [string, TriviumGoalTier, string][] = [
    ['goal.g0', 'g0', 'adopted'],
    ['goal.g1', 'g1', 'rejected'],
    ['goal.g1b', 'g1', 'adopted'],
    ['goal.g2', 'g2', 'adopted'],
    ['ticket.t1', 'g3', 'adopted'],
    ['ticket.t2', 'g3', 'adopted'],
    ['ticket.t3', 'g3', 'retired'],
    ['ticket.t4', 'g3', 'replaced'],
    ['ticket.t5', 'g3', 'rejected'],
    ['goal.t6', 'g3', 'candidate'],
    ['ticket.t7', 'g3', 'proposed-later'],
    ['ticket.t8', 'g3', 'adopted']
  ]
  const edges: [string, string][] = [
    ['goal.g1', 'goal.g0'],
    ['goal.g1b', 'goal.g0'],
    ['goal.g2', 'goal.g1'],
    ['ticket.t1', 'goal.g2'],
    ['ticket.t2', 'goal.g0'],
    ['ticket.t3', 'goal.g2'],
    ['ticket.t4', 'goal.g2'],
    ['ticket.t5', 'goal.g2'],
    ['goal.t6', 'goal.g2'],
    ['goal.t6', 'goal.g1b'],
    ['ticket.t7', 'goal.g2'],
    ['ticket.t8', 'ticket.t1']
  ]
  const states: Record<string, string> = {
    'ticket.t1': 'done',
    'ticket.t2': 'abandoned',
    'ticket.t3': 'done',
    'ticket.t4': 'open',
    'ticket.t5': 'done',
    'goal.t6': 'done',
    'ticket.t7': 'in-progress',
    'ticket.t8': 'open'
  }
  const status = makeSmallTriviumStatus(nodes, edges)
  const rows = Object.entries(states).map(([id, state]) => ({
    id,
    state,
    status: nodes.find((node) => node[0] === id)?.[2]
  }))
  const model = buildTriviumModel({
    status,
    tickets: readTriviumTickets({ tickets: rows }),
    progress: null
  })

  it('matches hand-computed trivium counts', () => {
    // Hidden tickets drop out; abandoned and unknown-status tickets stay outstanding; a ticket
    // reached twice counts once; ancestry passes through the rejected G1 and the ticket t1.
    expect(workOf(model, 'goal.g2')).toEqual({ done: 2, total: 4 })
    expect(workOf(model, 'goal.g1')).toEqual({ done: 2, total: 4 })
    expect(workOf(model, 'goal.g1b')).toEqual({ done: 1, total: 1 })
    expect(workOf(model, 'goal.g0')).toEqual({ done: 2, total: 5 })
    const rule = triviumRecordedTickets(status.goals.nodes, status.goals.edges, rows)
    for (const id of ['goal.g0', 'goal.g1', 'goal.g1b', 'goal.g2']) {
      expect(workOf(model, id)).toEqual(rule.get(id))
    }
    expect(model.work('goal.g0').fraction).toBeCloseTo(0.4)
  })

  it('matches the rule on 300 seeded random graphs', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const graph = makeRandomTriviumGraph(seed)
      const random = buildTriviumModel({
        status: graph.status,
        tickets: readTriviumTickets({ tickets: graph.ticketRecords }),
        progress: null
      })
      const rule = triviumRecordedTickets(
        graph.status.goals.nodes,
        graph.status.goals.edges,
        graph.ticketRecords
      )
      for (const node of graph.status.goals.nodes) {
        if (node.tier !== 'g3') {
          expect({ seed, id: node.id, ...workOf(random, node.id) }).toEqual({
            seed,
            id: node.id,
            ...(rule.get(node.id) ?? { done: 0, total: 0 })
          })
        }
      }
    }
  })
})

describe('recorded work read from progress', () => {
  it('prefers recorded_work over the graph when both disagree', () => {
    const head = makeTriviumModelInput('head')
    const raw = makeTriviumModelProgress('head')
    const original = records(raw.goals)
    const goals = original.map((goal): Record<string, unknown> => ({
      ...goal,
      recorded_work: {
        ...(isTriviumRecord(goal.recorded_work) ? goal.recorded_work : {}),
        completed_tickets: 1,
        outstanding_tickets: 3
      }
    }))
    const model = buildTriviumModel({ ...head, progress: readTriviumProgress({ ...raw, goals }) })
    expect(original).toHaveLength(4)
    for (const goal of original) {
      expect(model.work(String(goal.goal_id))).toMatchObject({
        done: 1,
        total: 4,
        fraction: 0.25,
        source: 'recorded-work'
      })
    }
  })
})
