import { describe, expect, it } from 'vitest'
import type { TriviumGoalEdge, TriviumGoalNode } from '../../../../shared/trivium-workspace-status'
import { buildTriviumGoalOutline, type TriviumGoalOutlineNode } from './trivium-goal-outline'

function goal(id: string, tier: TriviumGoalNode['tier']): TriviumGoalNode {
  return { id, tier, title: `Title ${id}`, statement: `Statement ${id}`, status: 'adopted' }
}

function contributesTo(child: string, parent: string): TriviumGoalEdge {
  return {
    id: `edge.${child}-${parent}`,
    source: child,
    target: parent,
    relation: 'contributes-to'
  }
}

function idsOf(branches: TriviumGoalOutlineNode[]): string[] {
  return branches.map((branch) => branch.node.id)
}

describe('buildTriviumGoalOutline', () => {
  it('nests contributes-to children under their parent', () => {
    const outline = buildTriviumGoalOutline(
      [goal('g0', 'g0'), goal('g1', 'g1'), goal('g2', 'g2'), goal('t1', 'g3')],
      [contributesTo('g1', 'g0'), contributesTo('g2', 'g1'), contributesTo('t1', 'g2')]
    )

    expect(idsOf(outline.roots)).toEqual(['g0'])
    expect(idsOf(outline.roots[0].children)).toEqual(['g1'])
    expect(idsOf(outline.roots[0].children[0].children)).toEqual(['g2'])
    expect(idsOf(outline.roots[0].children[0].children[0].children)).toEqual(['t1'])
  })

  it('repeats a node under each parent and flags it shared', () => {
    const outline = buildTriviumGoalOutline(
      [goal('a', 'g1'), goal('b', 'g1'), goal('shared', 'g2')],
      [contributesTo('shared', 'a'), contributesTo('shared', 'b')]
    )

    expect(idsOf(outline.roots)).toEqual(['a', 'b'])
    expect(idsOf(outline.roots[0].children)).toEqual(['shared'])
    expect(idsOf(outline.roots[1].children)).toEqual(['shared'])
    expect(outline.roots[0].children[0].shared).toBe(true)
    expect(outline.roots[0].shared).toBe(false)
  })

  it('returns depends-on edges as a flat list, never as hierarchy', () => {
    const dependsOn: TriviumGoalEdge = {
      id: 'edge.dep',
      source: 't2',
      target: 't1',
      relation: 'depends-on'
    }
    const outline = buildTriviumGoalOutline([goal('t1', 'g3'), goal('t2', 'g3')], [dependsOn])

    expect(outline.dependencies).toEqual([dependsOn])
    expect(idsOf(outline.roots)).toEqual(['t1', 't2'])
    expect(outline.roots[0].children).toEqual([])
  })

  it('renders every node once when contributes-to edges form a cycle', () => {
    const outline = buildTriviumGoalOutline(
      [goal('a', 'g1'), goal('b', 'g1'), goal('c', 'g1')],
      [contributesTo('a', 'b'), contributesTo('b', 'c'), contributesTo('c', 'a')]
    )

    expect(idsOf(outline.roots)).toEqual(['a'])
    expect(idsOf(outline.roots[0].children)).toEqual(['c'])
    expect(idsOf(outline.roots[0].children[0].children)).toEqual(['b'])
    expect(outline.roots[0].children[0].children[0].children).toEqual([])
  })

  it('treats an edge naming an unknown goal as no parent', () => {
    const outline = buildTriviumGoalOutline(
      [goal('child', 'g2')],
      [contributesTo('child', 'missing-parent')]
    )

    expect(idsOf(outline.roots)).toEqual(['child'])
  })

  it('collapses duplicate contributes-to edges between the same pair', () => {
    const outline = buildTriviumGoalOutline(
      [goal('parent', 'g1'), goal('child', 'g2')],
      [
        contributesTo('child', 'parent'),
        { id: 'edge.duplicate', source: 'child', target: 'parent', relation: 'contributes-to' }
      ]
    )

    expect(idsOf(outline.roots[0].children)).toEqual(['child'])
    expect(outline.roots[0].children[0].shared).toBe(false)
  })
})
