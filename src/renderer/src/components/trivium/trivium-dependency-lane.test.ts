import { describe, expect, it } from 'vitest'
import {
  assignTriviumLanes,
  layoutTriviumLanes,
  placeTriviumDependencyEdges,
  reservedTriviumLanes,
  triviumDependencyEdges,
  triviumLaneCount,
  triviumLaneArrowPaths,
  triviumLaneWidth,
  type TriviumRowEdge
} from './trivium-dependency-lane'
import { buildTriviumTreeEntries, triviumCanonicalKey } from './trivium-goal-tree'
import { makeTriviumFixtureModel } from './trivium-model.fixture'
import { everyOpenKey, makeSmallTreeModel, makeTreeRows } from './trivium-tree-model.fixture'

const model = makeSmallTreeModel()
const canonicalKey = (id: string): string | null => triviumCanonicalKey(model, id)
const A1_GROUP = 'goal.root>goal.a>goal.a1>goal.a1#tickets'

function edge(fromId: string, toId: string, from: number, to: number): TriviumRowEdge {
  return { fromId, toId, from, to }
}

describe('assignTriviumLanes', () => {
  it('shares a lane between intervals that do not overlap', () => {
    expect(
      assignTriviumLanes([
        [0, 2],
        [3, 5],
        [6, 9]
      ])
    ).toEqual([0, 0, 0])
  })

  it('separates overlapping intervals, including ones that share an end row', () => {
    expect(
      assignTriviumLanes([
        [0, 3],
        [2, 5]
      ])
    ).toEqual([0, 1])
    expect(
      assignTriviumLanes([
        [0, 2],
        [2, 4]
      ])
    ).toEqual([0, 1])
    expect(
      assignTriviumLanes([
        [0, 9],
        [1, 8],
        [2, 7]
      ])
    ).toEqual([2, 1, 0])
  })

  it('places shorter spans first, so they keep the lanes nearest the rows', () => {
    expect(
      assignTriviumLanes([
        [0, 10],
        [1, 2],
        [4, 6]
      ])
    ).toEqual([1, 0, 0])
    expect(assignTriviumLanes([])).toEqual([])
  })
})

describe('placeTriviumDependencyEdges', () => {
  const edges = triviumDependencyEdges(model)

  it('lists every depends-on edge between shown items', () => {
    expect(edges).toEqual([
      { from: 't.2', to: 't.1' },
      { from: 't.3', to: 't.1' }
    ])
    expect(triviumDependencyEdges(makeTriviumFixtureModel())).toHaveLength(12)
  })

  it('draws from the rows themselves when they are shown', () => {
    // 0 root, 1 a, 2 a1, 3 a1#tickets, 4 t.1, 5 t.2, 6 b, 7 b#tickets, 8 t.3
    const rows = makeTreeRows(model, everyOpenKey(buildTriviumTreeEntries(model)))
    expect(placeTriviumDependencyEdges(rows, edges, canonicalKey)).toEqual([
      edge('t.2', 't.1', 5, 4),
      edge('t.3', 't.1', 8, 4)
    ])
  })

  it('attaches an endpoint inside a closed group to the group row and skips same-row edges', () => {
    const open = everyOpenKey(buildTriviumTreeEntries(model))
    open.delete(A1_GROUP)
    // 0 root, 1 a, 2 a1, 3 a1#tickets (closed), 4 b, 5 b#tickets, 6 t.3
    const rows = makeTreeRows(model, open)
    expect(placeTriviumDependencyEdges(rows, edges, canonicalKey)).toEqual([
      edge('t.3', 't.1', 6, 3)
    ])
    // Everything closed: both ends of both edges land on the root row.
    expect(
      placeTriviumDependencyEdges(makeTreeRows(model, new Set()), edges, canonicalKey)
    ).toEqual([])
  })

  it('climbs to the nearest shown row above a closed Goal and drops unknown ids', () => {
    // 0 root, 1 a (closed), 2 b, 3 b#tickets, 4 t.3
    const rows = makeTreeRows(
      model,
      new Set(['goal.root', 'goal.root>goal.b', 'goal.root>goal.b>goal.b#tickets'])
    )
    expect(
      placeTriviumDependencyEdges(rows, [...edges, { from: 't.3', to: 'goal.gone' }], canonicalKey)
    ).toEqual([edge('t.3', 't.1', 4, 1)])
  })
})

describe('layoutTriviumLanes', () => {
  const placed = [edge('x', 'y', 0, 2), edge('z', 'y', 4, 2), edge('w', 'v', 5, 9)]

  it('draws only the edges of the hovered and selected items unless all are shown', () => {
    expect(layoutTriviumLanes(placed, new Set(['z']), false)).toEqual([
      { from: 4, to: 2, strong: true, lane: 0 }
    ])
    expect(layoutTriviumLanes(placed, new Set(), false)).toEqual([])
  })

  it('shows every edge muted with the focused ones strong and painted last', () => {
    const drawn = layoutTriviumLanes(placed, new Set(['x']), true)
    expect(drawn.map((item) => [item.from, item.to, item.strong, item.lane])).toEqual([
      [4, 2, false, 1],
      [5, 9, false, 0],
      [0, 2, true, 0]
    ])
    expect(triviumLaneCount(drawn)).toBe(2)
  })

  it('merges edges that land on the same pair of rows', () => {
    const merged = layoutTriviumLanes(
      [edge('a', 'g', 1, 3), edge('b', 'g', 1, 3)],
      new Set(['b']),
      true
    )
    expect(merged).toEqual([{ from: 1, to: 3, strong: true, lane: 0 }])
  })
})

describe('reservedTriviumLanes', () => {
  const rows = ['p', 'q', 'r', 's', 't'].map((id) => ({ id, key: id }))
  // Rows 0..4; every pair of these intervals overlaps: [0,1], [0,3], [1,4].
  const placed = [edge('q', 'p', 1, 0), edge('s', 'p', 3, 0), edge('t', 'q', 4, 1)]

  it('reserves what the busiest hovered row needs next to the selection', () => {
    expect(reservedTriviumLanes(placed, rows, null, false)).toBe(2)
    expect(reservedTriviumLanes(placed, rows, 't', false)).toBe(3)
    // Only rows on screen can be hovered.
    expect(reservedTriviumLanes(placed, rows.slice(2), null, false)).toBe(1)
  })

  it('reserves every lane when all edges show', () => {
    expect(reservedTriviumLanes(placed, rows, null, true)).toBe(3)
    expect(reservedTriviumLanes([], rows, null, true)).toBe(0)
  })
})

describe('lane geometry', () => {
  it('grows the lane column by one step per lane past the minimum', () => {
    expect([0, 1, 2, 3].map(triviumLaneWidth)).toEqual([22, 22, 28, 35])
  })

  it('routes an arrow from the dependent row out along its lane and back into the dependency', () => {
    const [down, up] = triviumLaneArrowPaths(
      [
        { from: 0, to: 2, strong: true, lane: 0 },
        { from: 2, to: 1, strong: false, lane: 1 }
      ],
      [0, 32, 64],
      100
    )
    expect(down).toEqual({
      key: '0>2',
      strong: true,
      line: 'M105 16H106Q110 16 110 20V76Q110 80 106 80H108',
      arrow: 'M103 80l5.5-3.2v6.4z',
      dotX: 104.5,
      dotY: 16
    })
    expect(up.line).toBe('M105 80H113Q117 80 117 76V52Q117 48 113 48H108')
    expect(triviumLaneArrowPaths([{ from: 0, to: 5, strong: false, lane: 0 }], [0], 0)).toEqual([])
  })
})
