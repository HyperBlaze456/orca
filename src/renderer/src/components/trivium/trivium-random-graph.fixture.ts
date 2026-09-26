import type {
  TriviumGoalRelation,
  TriviumGoalTier,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import { makeSmallTriviumStatus } from './trivium-model.fixture'

// Seeded random Goal graphs for property tests. Contribution edges always point to an earlier
// node, so the contributes-to graph is acyclic; tickets may also contribute to earlier tickets.

const STATUSES = [
  'adopted',
  'adopted',
  'adopted',
  'adopted',
  'candidate',
  'anticipated',
  'rejected',
  'retired',
  'replaced',
  'proposed-later'
]
const STATES = ['open', 'in-progress', 'blocked', 'done', 'done', 'done', 'abandoned']

export type RandomTriviumGraph = {
  status: TriviumWorkspaceStatus
  /** Raw `trivium.tickets` rows, one per G3 node. */
  ticketRecords: Record<string, unknown>[]
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRandomTriviumGraph(
  seed: number,
  acyclicDependencies = true
): RandomTriviumGraph {
  const random = seededRandom(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]
  const goalCount = 2 + Math.floor(random() * 6)
  const ticketCount = 2 + Math.floor(random() * 12)
  const goalTiers: TriviumGoalTier[] = ['g0']
  for (let index = 1; index < goalCount; index += 1) {
    goalTiers.push(pick<TriviumGoalTier>(['g1', 'g1', 'g2', 'g2', 'g0']))
  }
  goalTiers.sort()
  const goals = goalTiers.map((_, index) => `goal.g${index}`)
  const tickets = Array.from({ length: ticketCount }, (_, index) =>
    index % 5 === 4 ? `goal.t${index}` : `ticket.t${index}`
  )
  const nodes: [string, TriviumGoalTier, string][] = [
    ...goals.map((id, index): [string, TriviumGoalTier, string] => [
      id,
      goalTiers[index],
      pick(STATUSES)
    ]),
    ...tickets.map((id): [string, TriviumGoalTier, string] => [id, 'g3', pick(STATUSES)])
  ]
  const edges: [string, string, TriviumGoalRelation?][] = []
  const parentsOf = new Map<string, string[]>()
  const contribute = (source: string, target: string): void => {
    const list = parentsOf.get(source) ?? []
    if (!list.includes(target) && source !== target) {
      list.push(target)
      parentsOf.set(source, list)
      edges.push([source, target])
    }
  }
  goals.forEach((id, index) => {
    if (index > 0 && random() < 0.85) {
      contribute(id, goals[Math.floor(random() * index)])
      if (random() < 0.25) {
        contribute(id, goals[Math.floor(random() * index)])
      }
    }
  })
  tickets.forEach((id, index) => {
    if (random() < 0.85) {
      contribute(id, pick(goals))
      if (random() < 0.3) {
        contribute(id, pick(goals))
      }
    }
    if (index > 0 && random() < 0.1) {
      contribute(id, tickets[Math.floor(random() * index)])
    }
  })
  const dependsOn = new Map<string, string[]>()
  tickets.forEach((id, index) => {
    const targets = tickets.filter(
      (other, otherIndex) =>
        (acyclicDependencies ? otherIndex < index : other !== id) && random() < 0.2
    )
    dependsOn.set(id, targets)
    for (const target of targets) {
      edges.push([id, target, 'depends-on'])
    }
  })
  const status = makeSmallTriviumStatus(nodes, edges)
  const statusOf = new Map(nodes.map(([id, , nodeStatus]) => [id, nodeStatus]))
  const ticketRecords = tickets.map((id) => ({
    id,
    title: `Record ${id}`,
    state: pick(STATES),
    status: statusOf.get(id),
    parent: parentsOf.get(id)?.[0] ?? null,
    depends_on: dependsOn.get(id) ?? []
  }))
  return { status, ticketRecords }
}
