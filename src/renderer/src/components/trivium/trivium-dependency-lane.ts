import type { TriviumModel } from './trivium-goal-model'
import { triviumKeyAncestors } from './trivium-goal-tree'

/** `from` depends on `to`. */
export type TriviumDependencyEdge = { from: string; to: string }

/** A row on screen: the item it shows and its outline key. */
export type TriviumLaneRow = { id: string; key: string }

/** A dependency placed on rows; `from` and `to` are row indexes and never equal. */
export type TriviumRowEdge = { fromId: string; toId: string; from: number; to: number }

/** One arrow, out of the dependent's row and into the row of what it depends on. */
export type TriviumLaneEdge = { from: number; to: number; strong: boolean; lane: number }

export type TriviumLaneArrowPath = {
  key: string
  strong: boolean
  line: string
  arrow: string
  dotX: number
  dotY: number
}

export const TRIVIUM_LANE_STEP = 7
/** Distance from a row's top to the middle of its first text line. */
export const TRIVIUM_LANE_ROW_ANCHOR = 16
const LANE_MIN_WIDTH = 22
const LANE_PADDING = 14
const LANE_INSET = 3

/** Every depends-on edge between shown items. */
export function triviumDependencyEdges(model: TriviumModel): TriviumDependencyEdge[] {
  return model.nodes
    .filter((node) => model.isShown(node.id))
    .flatMap((node) => model.dependsOn(node.id).map((to) => ({ from: node.id, to })))
}

/**
 * Puts each endpoint on the row it is drawn at: its first row on screen, else the nearest row
 * above its canonical key (the collapsed group or Goal that hides it). Edges whose ends land on
 * the same row, or on no row, are dropped.
 */
export function placeTriviumDependencyEdges(
  rows: readonly TriviumLaneRow[],
  edges: readonly TriviumDependencyEdge[],
  canonicalKey: (id: string) => string | null
): TriviumRowEdge[] {
  const byId = new Map<string, number>()
  const byKey = new Map<string, number>()
  rows.forEach((row, index) => {
    if (!byId.has(row.id)) {
      byId.set(row.id, index)
    }
    byKey.set(row.key, index)
  })
  const placed = new Map<string, number | null>()
  const rowOf = (id: string): number | null => {
    const known = placed.get(id)
    if (known !== undefined) {
      return known
    }
    let index = byId.get(id) ?? null
    const key = index === null ? canonicalKey(id) : null
    const above = key ? triviumKeyAncestors(key) : []
    for (let depth = above.length - 1; depth >= 0 && index === null; depth -= 1) {
      index = byKey.get(above[depth]) ?? null
    }
    placed.set(id, index)
    return index
  }
  return edges.flatMap((edge) => {
    const from = rowOf(edge.from)
    const to = rowOf(edge.to)
    return from === null || to === null || from === to
      ? []
      : [{ fromId: edge.from, toId: edge.to, from, to }]
  })
}

/**
 * Greedy lanes by row interval, shortest span first: each interval takes the lowest lane where
 * it overlaps nothing. Intervals sharing an end row overlap (their arrows would meet).
 */
export function assignTriviumLanes(intervals: readonly (readonly [number, number])[]): number[] {
  const span = (index: number): number => intervals[index][1] - intervals[index][0]
  const order = intervals.map((_, index) => index).sort((a, b) => span(a) - span(b) || a - b)
  const taken: (readonly [number, number])[][] = []
  const lanes = intervals.map(() => 0)
  for (const index of order) {
    const [low, high] = intervals[index]
    let lane = 0
    while (taken[lane]?.some(([start, end]) => low <= end && high >= start)) {
      lane += 1
    }
    taken[lane] = [...(taken[lane] ?? []), intervals[index]]
    lanes[index] = lane
  }
  return lanes
}

/**
 * The arrows to draw: every placed edge when `showAll`, else only those touching a focus id
 * (the hovered and the selected item). Edges on the same pair of rows merge; `strong` means it
 * touches a focus id, and strong arrows come last so they paint on top.
 */
export function layoutTriviumLanes(
  edges: readonly TriviumRowEdge[],
  focus: ReadonlySet<string>,
  showAll: boolean
): TriviumLaneEdge[] {
  const merged = new Map<string, { from: number; to: number; strong: boolean }>()
  for (const edge of edges) {
    const strong = focus.has(edge.fromId) || focus.has(edge.toId)
    const pair = `${edge.from}>${edge.to}`
    const known = merged.get(pair)
    if (known) {
      known.strong ||= strong
    } else if (strong || showAll) {
      merged.set(pair, { from: edge.from, to: edge.to, strong })
    }
  }
  const drawn = [...merged.values()]
  const lanes = assignTriviumLanes(
    drawn.map((edge): [number, number] => [
      Math.min(edge.from, edge.to),
      Math.max(edge.from, edge.to)
    ])
  )
  return drawn
    .map((edge, index) => ({ ...edge, lane: lanes[index] }))
    .sort((a, b) => Number(a.strong) - Number(b.strong))
}

export function triviumLaneCount(edges: readonly TriviumLaneEdge[]): number {
  return edges.reduce((most, edge) => Math.max(most, edge.lane + 1), 0)
}

/**
 * Lanes the column keeps room for, so hovering never changes its width (and never reflows the
 * titles under the pointer): every edge when `showAll`, else the most that any one hoverable
 * row needs next to the selected item.
 */
export function reservedTriviumLanes(
  edges: readonly TriviumRowEdge[],
  rows: readonly TriviumLaneRow[],
  selectedId: string | null,
  showAll: boolean
): number {
  if (showAll) {
    return triviumLaneCount(layoutTriviumLanes(edges, new Set(), true))
  }
  const endpoints = new Set(edges.flatMap((edge) => [edge.fromId, edge.toId]))
  const hoverable = [null, ...new Set(rows.map((row) => row.id).filter((id) => endpoints.has(id)))]
  let most = 0
  for (const hovered of hoverable) {
    const focus = new Set([hovered, selectedId].filter((id): id is string => id !== null))
    most = Math.max(most, triviumLaneCount(layoutTriviumLanes(edges, focus, false)))
  }
  return most
}

/** Width of the lane column for a number of lanes (px). */
export function triviumLaneWidth(lanes: number): number {
  return Math.max(LANE_MIN_WIDTH, LANE_PADDING + lanes * TRIVIUM_LANE_STEP)
}

/**
 * Arrow geometry from measured row tops and the lane column's left edge: a dot on the
 * dependent's row, out along its lane, and an arrowhead pointing back into the dependency's row.
 */
export function triviumLaneArrowPaths(
  edges: readonly TriviumLaneEdge[],
  rowTops: readonly number[],
  laneLeft: number
): TriviumLaneArrowPath[] {
  const x = laneLeft + LANE_INSET
  return edges.flatMap((edge) => {
    const fromTop = rowTops[edge.from]
    const toTop = rowTops[edge.to]
    if (fromTop === undefined || toTop === undefined) {
      return []
    }
    const y1 = fromTop + TRIVIUM_LANE_ROW_ANCHOR
    const y2 = toTop + TRIVIUM_LANE_ROW_ANCHOR
    const turn = x + TRIVIUM_LANE_STEP * (edge.lane + 1)
    const dir = y2 > y1 ? 1 : -1
    const radius = Math.min(4, Math.abs(y2 - y1) / 2)
    return [
      {
        key: `${edge.from}>${edge.to}`,
        strong: edge.strong,
        line: `M${x + 2} ${y1}H${turn - radius}Q${turn} ${y1} ${turn} ${y1 + dir * radius}V${y2 - dir * radius}Q${turn} ${y2} ${turn - radius} ${y2}H${x + 5}`,
        arrow: `M${x} ${y2}l5.5-3.2v6.4z`,
        dotX: x + 1.5,
        dotY: y1
      }
    ]
  })
}
