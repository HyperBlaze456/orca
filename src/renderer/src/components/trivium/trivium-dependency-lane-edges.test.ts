import { describe, expect, it } from 'vitest'
import type {
  TriviumGoalRelation,
  TriviumGoalTier
} from '../../../../shared/trivium-workspace-status'
import {
  assignTriviumLanes,
  layoutTriviumLanes,
  placeTriviumDependencyEdges,
  reservedTriviumLanes,
  triviumDependencyEdges,
  triviumLaneCount,
  triviumLaneArrowPaths,
  triviumLaneWidth,
  type TriviumLaneRow,
  type TriviumRowEdge
} from './trivium-dependency-lane'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import {
  buildTriviumTreeEntries,
  triviumCanonicalKey,
  triviumDefaultExpandedKeys,
  triviumKeyAncestors
} from './trivium-goal-tree'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import { makeRandomTriviumGraph } from './trivium-random-graph.fixture'
import { readTriviumTickets } from './trivium-ticket-records'
import { everyOpenKey, makeTreeRows } from './trivium-tree-model.fixture'

// Verifier edge cases for the dependency lane (WO-2): endpoint placement, lanes, reserved width.

type NodeRow = [string, TriviumGoalTier, string]
type EdgeRow = [string, string, TriviumGoalRelation?]

function smallModel(nodes: NodeRow[], edges: EdgeRow[]): TriviumModel {
  return buildTriviumModel({
    status: makeSmallTriviumStatus(nodes, edges),
    tickets: [],
    progress: null
  })
}

function place(model: TriviumModel, open: Iterable<string>): TriviumRowEdge[] {
  return placeTriviumDependencyEdges(
    makeTreeRows(model, new Set(open)),
    triviumDependencyEdges(model),
    (id) => triviumCanonicalKey(model, id)
  )
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('placeTriviumDependencyEdges edges', () => {
  // root ─┬─ a ── [a.1]
  //       └─ b ── [b.1]      b.1 depends on a.1
  const crossGroups = smallModel(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.a', 'g1', 'adopted'],
      ['goal.b', 'g1', 'adopted'],
      ['a.1', 'g3', 'adopted'],
      ['b.1', 'g3', 'adopted']
    ],
    [
      ['goal.a', 'goal.root'],
      ['goal.b', 'goal.root'],
      ['a.1', 'goal.a'],
      ['b.1', 'goal.b'],
      ['b.1', 'a.1', 'depends-on']
    ]
  )

  it('attaches a dependency inside a closed group to that group row, from an open group', () => {
    // 0 root, 1 a, 2 a#tickets (closed), 3 b, 4 b#tickets, 5 b.1
    expect(
      place(crossGroups, [
        'goal.root',
        'goal.root>goal.a',
        'goal.root>goal.b',
        'goal.root>goal.b>goal.b#tickets'
      ])
    ).toEqual([{ fromId: 'b.1', toId: 'a.1', from: 5, to: 2 }])
  })

  it('climbs to the closed Goal when its ticket group is not on screen either', () => {
    // 0 root, 1 a (closed), 2 b, 3 b#tickets, 4 b.1
    expect(
      place(crossGroups, ['goal.root', 'goal.root>goal.b', 'goal.root>goal.b>goal.b#tickets'])
    ).toEqual([{ fromId: 'b.1', toId: 'a.1', from: 4, to: 1 }])
    // Default expansion: both groups closed, so the arrow runs group row to group row.
    const defaults = triviumDefaultExpandedKeys(buildTriviumTreeEntries(crossGroups))
    expect(place(crossGroups, defaults)).toEqual([{ fromId: 'b.1', toId: 'a.1', from: 4, to: 2 }])
  })

  // root ─┬─ a ── [t.s]
  //       └─ b ── [t.s, u]   u depends on t.s; t.s opens under a (its first parent)
  const twoParents = smallModel(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.a', 'g1', 'adopted'],
      ['goal.b', 'g1', 'adopted'],
      ['t.s', 'g3', 'adopted'],
      ['u', 'g3', 'adopted']
    ],
    [
      ['goal.a', 'goal.root'],
      ['goal.b', 'goal.root'],
      ['t.s', 'goal.a'],
      ['t.s', 'goal.b'],
      ['u', 'goal.b'],
      ['u', 't.s', 'depends-on']
    ]
  )

  it('uses the row a ticket shows under its second parent before its closed canonical group', () => {
    expect(triviumCanonicalKey(twoParents, 't.s')).toBe('goal.root>goal.a>goal.a#tickets>t.s')
    const top = ['goal.root', 'goal.root>goal.a', 'goal.root>goal.b']
    // 0 root, 1 a, 2 a#tickets (closed), 3 b, 4 b#tickets, 5 t.s, 6 u
    expect(place(twoParents, [...top, 'goal.root>goal.b>goal.b#tickets'])).toEqual([
      { fromId: 'u', toId: 't.s', from: 6, to: 5 }
    ])
    // 0 root, 1 a, 2 a#tickets, 3 t.s, 4 b, 5 b#tickets (closed)
    expect(place(twoParents, [...top, 'goal.root>goal.a>goal.a#tickets'])).toEqual([
      { fromId: 'u', toId: 't.s', from: 5, to: 3 }
    ])
    // Both closed: each end on its own canonical group row.
    expect(place(twoParents, top)).toEqual([{ fromId: 'u', toId: 't.s', from: 4, to: 2 }])
  })

  it('puts unparented tickets on the closed unparented group row and skips edges inside it', () => {
    const model = smallModel(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['a.1', 'g3', 'adopted'],
        ['u.1', 'g3', 'adopted'],
        ['u.2', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['a.1', 'goal.a'],
        ['u.1', 'a.1', 'depends-on'],
        ['u.2', 'u.1', 'depends-on']
      ]
    )
    // 0 root, 1 a, 2 a#tickets, 3 unparented#tickets
    const defaults = triviumDefaultExpandedKeys(buildTriviumTreeEntries(model))
    expect(place(model, defaults)).toEqual([{ fromId: 'u.1', toId: 'a.1', from: 3, to: 2 }])
    // Open, the unparented tickets have rows of their own.
    const open = place(model, everyOpenKey(buildTriviumTreeEntries(model)))
    expect(open.map((edge) => `${edge.fromId}>${edge.toId}`).sort()).toEqual(['u.1>a.1', 'u.2>u.1'])
    expect(open.every((edge) => edge.from !== edge.to)).toBe(true)
  })

  it('never lists an edge to or from a hidden item', () => {
    const model = smallModel(
      [
        ['goal.root', 'g0', 'adopted'],
        ['t.1', 'g3', 'adopted'],
        ['t.gone', 'g3', 'rejected'],
        ['t.old', 'g3', 'retired']
      ],
      [
        ['t.1', 'goal.root'],
        ['t.gone', 'goal.root'],
        ['t.old', 'goal.root'],
        ['t.gone', 't.1', 'depends-on'],
        ['t.1', 't.old', 'depends-on']
      ]
    )
    expect(triviumDependencyEdges(model)).toEqual([])
  })

  it('maps every endpoint to its first row on screen, else the deepest shown row above its canonical key', () => {
    let throughRowAbove = 0
    let drawnTotal = 0
    for (let seed = 1; seed <= 200; seed += 1) {
      const graph = makeRandomTriviumGraph(seed, seed % 2 === 0)
      const model = buildTriviumModel({
        status: graph.status,
        tickets: readTriviumTickets({ tickets: graph.ticketRecords }),
        progress: null
      })
      const entries = buildTriviumTreeEntries(model)
      const open = [...everyOpenKey(entries)].filter((_, index) => (index * 7 + seed) % 3 !== 0)
      const rows = makeTreeRows(model, new Set(open))
      const edges = triviumDependencyEdges(model)
      const placed = placeTriviumDependencyEdges(rows, edges, (id) =>
        triviumCanonicalKey(model, id)
      )
      const expectedRow = (id: string): number | null => {
        const shown = rows.findIndex((row) => row.id === id)
        if (shown !== -1) {
          return shown
        }
        const key = triviumCanonicalKey(model, id)
        const above = key ? triviumKeyAncestors(key).toReversed() : []
        for (const ancestor of above) {
          const index = rows.findIndex((row) => row.key === ancestor)
          if (index !== -1) {
            return index
          }
        }
        return null
      }
      const expected = edges.flatMap((edge) => {
        const from = expectedRow(edge.from)
        const to = expectedRow(edge.to)
        return from === null || to === null || from === to
          ? []
          : [{ fromId: edge.from, toId: edge.to, from, to }]
      })
      expect(placed).toEqual(expected)
      for (const edge of placed) {
        expect(edge.from).not.toBe(edge.to)
        drawnTotal += 1
        if (rows[edge.from].id !== edge.fromId || rows[edge.to].id !== edge.toId) {
          throughRowAbove += 1
        }
      }
    }
    // The random outlines exercise both direct rows and rows standing in for hidden ends.
    expect(drawnTotal).toBeGreaterThan(50)
    expect(throughRowAbove).toBeGreaterThan(10)
  })
})

describe('lane assignment properties', () => {
  it('never shares a lane between touching or overlapping intervals and nests shorter spans inside', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = seeded(seed)
      const count = 1 + Math.floor(random() * 12)
      const intervals = Array.from({ length: count }, (): [number, number] => {
        const low = Math.floor(random() * 20)
        return [low, low + 1 + Math.floor(random() * 10)]
      })
      const lanes = assignTriviumLanes(intervals)
      const span = (index: number): number => intervals[index][1] - intervals[index][0]
      const overlaps = (a: number, b: number): boolean =>
        intervals[a][0] <= intervals[b][1] && intervals[b][0] <= intervals[a][1]
      const order = intervals.map((_, index) => index).sort((a, b) => span(a) - span(b) || a - b)
      for (let a = 0; a < count; a += 1) {
        for (let b = a + 1; b < count; b += 1) {
          if (lanes[a] === lanes[b]) {
            expect(overlaps(a, b), `seed ${seed}: ${a} and ${b} share lane ${lanes[a]}`).toBe(false)
          }
          const [inner, outer] = span(a) < span(b) ? [a, b] : [b, a]
          const nested =
            span(inner) < span(outer) &&
            intervals[outer][0] <= intervals[inner][0] &&
            intervals[inner][1] <= intervals[outer][1]
          if (nested) {
            expect(lanes[inner]).toBeLessThan(lanes[outer])
          }
        }
        // Greedy: every lower lane holds an earlier-placed interval that blocks this one.
        const placedBefore = order.slice(0, order.indexOf(a))
        for (let lane = 0; lane < lanes[a]; lane += 1) {
          expect(placedBefore.some((other) => lanes[other] === lane && overlaps(a, other))).toBe(
            true
          )
        }
      }
    }
  })

  it('keeps a focused arrow strong when its muted twin on the same rows comes first', () => {
    const twins: TriviumRowEdge[] = [
      { fromId: 'a', toId: 'g', from: 1, to: 3 },
      { fromId: 'b', toId: 'g', from: 1, to: 3 }
    ]
    expect(layoutTriviumLanes(twins, new Set(['b']), false)).toEqual([
      { from: 1, to: 3, strong: true, lane: 0 }
    ])
    // Opposite directions between the same rows are two arrows in two lanes.
    const both = layoutTriviumLanes(
      [
        { fromId: 'a', toId: 'b', from: 1, to: 3 },
        { fromId: 'b', toId: 'a', from: 3, to: 1 }
      ],
      new Set(),
      true
    )
    expect(both.map((edge) => edge.lane).sort()).toEqual([0, 1])
  })
})

describe('reserved lane width', () => {
  it('always has room for what any hover draws, and every arrow turns inside the column', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = seeded(seed * 31)
      const rowCount = 2 + Math.floor(random() * 14)
      // Some ids repeat (a ticket under two parents) and some endpoints are off screen.
      const rows: TriviumLaneRow[] = Array.from({ length: rowCount }, (_, index) => ({
        id: `i${Math.floor(random() * rowCount)}`,
        key: `k${index}`
      }))
      const edgeCount = Math.floor(random() * 10)
      const edges: TriviumRowEdge[] = []
      for (let index = 0; index < edgeCount; index += 1) {
        const from = Math.floor(random() * rowCount)
        const to = Math.floor(random() * rowCount)
        if (from !== to) {
          const hidden = random() < 0.3
          edges.push({
            fromId: hidden ? `hidden${index}` : rows[from].id,
            toId: rows[to].id,
            from,
            to
          })
        }
      }
      const selectedId = random() < 0.5 ? rows[Math.floor(random() * rowCount)].id : null
      for (const showAll of [false, true]) {
        const reserved = reservedTriviumLanes(edges, rows, selectedId, showAll)
        const width = triviumLaneWidth(reserved)
        for (const hovered of [null, ...rows.map((row) => row.id)]) {
          const focus = new Set([hovered, selectedId].filter((id): id is string => id !== null))
          const drawn = layoutTriviumLanes(edges, focus, showAll)
          expect(triviumLaneCount(drawn), `seed ${seed} hover ${hovered}`).toBeLessThanOrEqual(
            reserved
          )
          const tops = rows.map((_, index) => index * 32)
          for (const arrowPath of triviumLaneArrowPaths(drawn, tops, 100)) {
            const turn = Number(/Q([\d.]+) /.exec(arrowPath.line)?.[1])
            expect(turn).toBeGreaterThan(100)
            expect(turn).toBeLessThanOrEqual(100 + width)
          }
        }
      }
    }
  })

  it('draws the arrowhead on the dependency row and the dot on the dependent row', () => {
    const [arrowPath] = triviumLaneArrowPaths(
      [{ from: 3, to: 1, strong: false, lane: 0 }],
      [0, 32, 64, 96],
      0
    )
    expect(arrowPath.dotY).toBe(96 + 16)
    expect(arrowPath.arrow.startsWith(`M3 ${32 + 16}`)).toBe(true)
  })
})
