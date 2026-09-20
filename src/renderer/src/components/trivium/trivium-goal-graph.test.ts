import { describe, expect, it } from 'vitest'
import { buildTriviumGoalGraph, buildTriviumNodePrompt } from './trivium-goal-graph'
import { makeTriviumStatus } from './trivium-workspace-status.fixture'

describe('Trivium goal graph', () => {
  it('lays out every tier below its parent and centers rows without overlapping siblings', () => {
    const { goals } = makeTriviumStatus()
    goals.nodes.push(
      { id: 'capability', tier: 'g2', title: 'Retry', statement: '', status: 'adopted' },
      { id: 'ticket', tier: 'g3', title: 'Verify', statement: '', status: 'candidate' },
      { id: 'sibling', tier: 'g1', title: 'Report errors', statement: '', status: 'anticipated' }
    )
    for (const size of ['standard', 'large'] as const) {
      const { nodes } = buildTriviumGoalGraph(goals, 'all', size)
      const [purpose, outcome, capability, ticket, sibling] = nodes
      expect(purpose.position.y).toBeLessThan(outcome.position.y)
      expect(outcome.position.y).toBeLessThan(capability.position.y)
      expect(capability.position.y).toBeLessThan(ticket.position.y)
      expect(outcome.position.y).toBe(sibling.position.y)
      expect(sibling.position.x - outcome.position.x).toBeGreaterThan(320)
      expect(purpose.position.x).toBe((outcome.position.x + sibling.position.x) / 2)
    }
  })

  it('hides rejected goals and dangling edges, with explicit all and status filters', () => {
    const { goals } = makeTriviumStatus()
    goals.nodes[1].status = 'rejected'
    const filtered = buildTriviumGoalGraph(goals)
    expect(filtered.nodes.map((node) => node.id)).toEqual(['goal.purpose'])
    expect(filtered.edges).toEqual([])
    expect(buildTriviumGoalGraph(goals, 'all').nodes).toHaveLength(2)
    expect(buildTriviumGoalGraph(goals, 'all').edges).toHaveLength(1)
    expect(buildTriviumGoalGraph(goals, 'rejected').nodes.map((node) => node.id)).toEqual([
      'goal.outcome'
    ])
    expect(buildTriviumGoalGraph(goals, 'candidate').nodes).toEqual([])
  })

  it('keeps contribution direction without labels covering the connections', () => {
    const { goals } = makeTriviumStatus()
    expect(buildTriviumGoalGraph(goals).edges[0]).toMatchObject({
      source: 'goal.outcome',
      target: 'goal.purpose',
      sourceHandle: 'contribution-source',
      targetHandle: 'contribution-target'
    })
    expect(buildTriviumGoalGraph(goals).edges[0].label).toBeUndefined()
  })

  it('retains shared nodes once, dependency direction, cycles and disconnected nodes', () => {
    const { goals } = makeTriviumStatus()
    goals.nodes.push({
      id: 'isolated',
      tier: 'g1',
      title: 'Isolated',
      statement: '',
      status: 'candidate'
    })
    goals.edges.push(
      {
        id: 'second-parent',
        source: 'goal.outcome',
        target: 'isolated',
        relation: 'contributes-to'
      },
      { id: 'cycle', source: 'goal.purpose', target: 'goal.outcome', relation: 'contributes-to' },
      { id: 'dependency', source: 'goal.outcome', target: 'goal.purpose', relation: 'depends-on' },
      { id: 'missing', source: 'absent', target: 'goal.purpose', relation: 'contributes-to' }
    )
    const graph = buildTriviumGoalGraph(goals)
    expect(graph.nodes.map((node) => node.id)).toEqual(goals.nodes.map((node) => node.id))
    expect(new Set(graph.nodes.map((node) => JSON.stringify(node.position))).size).toBe(3)
    expect(graph.edges).toHaveLength(4)
    expect(graph.edges.find((edge) => edge.id === 'dependency')).toMatchObject({
      source: 'goal.outcome',
      target: 'goal.purpose',
      style: { strokeDasharray: '5 5' }
    })
  })

  it('includes the selected node, incoming and outgoing relations and the requested change', () => {
    const { goals } = makeTriviumStatus()
    const prompt = buildTriviumNodePrompt(goals.nodes[0], goals, '  Update the retry policy.  ')
    expect(prompt).toContain('goal.purpose (G0, adopted)')
    expect(prompt).toContain('Uploads finish or report why.')
    expect(prompt).toContain(
      'goal.outcome (Resume interrupted uploads) --contributes-to--> goal.purpose'
    )
    expect(prompt).toContain('Requested change:\nUpdate the retry policy.')
  })
})
