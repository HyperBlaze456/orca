import type { TriviumGoalEdge } from '../../../../shared/trivium-workspace-status'
import type { TriviumTicket } from './trivium-ticket-records'

/**
 * Both Goal-graph relations as adjacency lists over every node, hidden statuses included.
 * Contribution runs child → parent (`source` is the child); dependency runs dependent →
 * dependency. An edge whose endpoints are not both known nodes is ignored.
 */
export type TriviumGoalEdgeIndex = {
  parents: ReadonlyMap<string, readonly string[]>
  children: ReadonlyMap<string, readonly string[]>
  dependsOn: ReadonlyMap<string, readonly string[]>
  requiredBy: ReadonlyMap<string, readonly string[]>
}

function addTo(lists: Map<string, string[]>, key: string, value: string): void {
  const list = lists.get(key)
  if (!list) {
    lists.set(key, [value])
  } else if (!list.includes(value)) {
    list.push(value)
  }
}

export function indexTriviumGoalEdges(
  nodeIds: ReadonlySet<string>,
  edges: readonly TriviumGoalEdge[],
  tickets: readonly TriviumTicket[]
): TriviumGoalEdgeIndex {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  const dependsOn = new Map<string, string[]>()
  const requiredBy = new Map<string, string[]>()
  const link = (relation: string, source: string, target: string): void => {
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) {
      return
    }
    if (relation === 'contributes-to') {
      addTo(parents, source, target)
      addTo(children, target, source)
    } else if (relation === 'depends-on') {
      addTo(dependsOn, source, target)
      addTo(requiredBy, target, source)
    }
  }
  for (const edge of edges) {
    link(edge.relation, edge.source, edge.target)
  }
  // The ticket records repeat their dependencies; they fill in an edge the status omits.
  for (const ticket of tickets) {
    for (const dependency of ticket.dependsOn ?? []) {
      link('depends-on', ticket.id, dependency)
    }
  }
  return { parents, children, dependsOn, requiredBy }
}
