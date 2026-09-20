import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { TriviumGoalNode, TriviumGoals } from '../../../../shared/trivium-workspace-status'

export type TriviumFlowNode = Node<{ goal: TriviumGoalNode }, 'goal'>

const TIER_ROW = { g0: 0, g1: 1, g2: 2, g3: 3 } as const

export type TriviumGraphFilter = 'not-rejected' | 'all' | TriviumGoalNode['status']
export type TriviumGraphTextSize = 'standard' | 'large'

export function matchesTriviumGraphFilter(
  goal: TriviumGoalNode,
  filter: TriviumGraphFilter
): boolean {
  return (
    filter === 'all' ||
    (filter === 'not-rejected' ? goal.status !== 'rejected' : goal.status === filter)
  )
}

export function buildTriviumGoalGraph(
  goals: TriviumGoals,
  filter: TriviumGraphFilter = 'not-rejected',
  textSize: TriviumGraphTextSize = 'standard'
): {
  nodes: TriviumFlowNode[]
  edges: Edge[]
} {
  const columns = { g0: 0, g1: 0, g2: 0, g3: 0 }
  const ids = new Set<string>()
  const nodes: TriviumFlowNode[] = []
  for (const goal of goals.nodes) {
    if (ids.has(goal.id) || !matchesTriviumGraphFilter(goal, filter)) {
      continue
    }
    ids.add(goal.id)
    nodes.push({
      id: goal.id,
      type: 'goal',
      data: { goal },
      position: {
        x: columns[goal.tier]++ * 384,
        y: TIER_ROW[goal.tier] * (textSize === 'large' ? 344 : 312)
      },
      ariaLabel: `${goal.tier.toUpperCase()}: ${goal.title}`
    })
  }
  const widestRow = Math.max(...Object.values(columns))
  for (const node of nodes) {
    node.position.x += ((widestRow - columns[node.data.goal.tier]) * 384) / 2
  }
  const edgeIds = new Set<string>()
  const edges: Edge[] = []
  for (const edge of goals.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edgeIds.has(edge.id)) {
      continue
    }
    edgeIds.add(edge.id)
    const dependency = edge.relation === 'depends-on'
    edges.push({
      ...edge,
      sourceHandle: dependency ? 'dependency-source' : 'contribution-source',
      targetHandle: dependency ? 'dependency-target' : 'contribution-target',
      ariaLabel: edge.relation,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--muted-foreground)' },
      style: { stroke: 'var(--muted-foreground)', strokeDasharray: dependency ? '5 5' : undefined }
    })
  }
  return { nodes, edges }
}

export function buildTriviumNodePrompt(
  goal: TriviumGoalNode,
  goals: TriviumGoals,
  instruction: string
): string {
  const related = goals.edges.filter((edge) => edge.source === goal.id || edge.target === goal.id)
  const titles = new Map(goals.nodes.map((node) => [node.id, node.title]))
  return [
    'Trivium goal context:',
    `${goal.id} (${goal.tier.toUpperCase()}, ${goal.status})`,
    goal.title,
    goal.statement,
    ...related.map(
      (edge) =>
        `${edge.source} (${titles.get(edge.source) ?? 'unavailable'}) --${edge.relation}--> ${edge.target} (${titles.get(edge.target) ?? 'unavailable'})`
    ),
    '',
    'Requested change:',
    instruction.trim()
  ].join('\n')
}
