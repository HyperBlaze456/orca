import { triviumKeyAncestors } from './trivium-goal-tree'
import type { TriviumTreeRow } from './trivium-tree-rows'

/**
 * One 20px gutter column. Column `d` of a row sits under the glyph of its ancestor at depth `d`:
 * a guide when that ancestor's line runs past the row, the elbow into the row's own glyph in
 * the last column. `strong` columns belong to the selected row's ancestry path.
 */
export type TriviumTreeColumn =
  | { kind: 'blank'; ancestorKey: string }
  | { kind: 'guide'; ancestorKey: string; strong: boolean }
  | {
      kind: 'elbow'
      ancestorKey: string
      /** `end` (└) for the last row under its parent, else `mid` (├). */
      joint: 'mid' | 'end'
      /** `path`: the row is on the selected path (top and stub strong); `through`: the path passes by. */
      strong: 'none' | 'path' | 'through'
    }

export type TriviumTreeGutter = {
  columns: readonly TriviumTreeColumn[]
  /** The line from under an open row's glyph to its first child. */
  down: 'none' | 'line' | 'strong'
}

/** The keys of a row and every row above it, root first; index = depth. */
function keyPrefixes(key: string): string[] {
  return [...triviumKeyAncestors(key), key]
}

/** Connector columns for every row, with the selected row's ancestry drawn strong. */
export function buildTriviumTreeGutters(
  rows: readonly TriviumTreeRow[],
  selectedKey: string | null
): TriviumTreeGutter[] {
  const indexByKey = new Map(rows.map((row, index) => [row.key, index]))
  const path = new Set<string>()
  // Row index -> columns the selected path passes through on that row.
  const passing = new Map<number, Set<number>>()
  if (selectedKey !== null && indexByKey.has(selectedKey)) {
    const chain = keyPrefixes(selectedKey)
    for (const key of chain) {
      path.add(key)
    }
    for (let depth = 0; depth < chain.length - 1; depth += 1) {
      const from = indexByKey.get(chain[depth]) ?? 0
      const to = indexByKey.get(chain[depth + 1]) ?? 0
      for (let index = from + 1; index < to; index += 1) {
        const columns = passing.get(index) ?? new Set<number>()
        columns.add(depth)
        passing.set(index, columns)
      }
    }
  }

  return rows.map((row, index) => {
    const ancestors = keyPrefixes(row.key)
    const passes = passing.get(index)
    const columns: TriviumTreeColumn[] = []
    for (let depth = 0; depth < row.depth - 1; depth += 1) {
      const ancestorKey = ancestors[depth]
      // The ancestor at depth + 1 has a later sibling, so the line at `depth` runs on.
      columns.push(
        row.ancestorLast[depth + 1]
          ? { kind: 'blank', ancestorKey }
          : { kind: 'guide', ancestorKey, strong: passes?.has(depth) ?? false }
      )
    }
    if (row.depth > 0) {
      columns.push({
        kind: 'elbow',
        ancestorKey: ancestors[row.depth - 1],
        joint: row.last ? 'end' : 'mid',
        strong: path.has(row.key) ? 'path' : passes?.has(row.depth - 1) ? 'through' : 'none'
      })
    }
    const onPathAbove = path.has(row.key) && row.key !== selectedKey
    return {
      columns,
      down: !row.expanded ? 'none' : onPathAbove ? 'strong' : 'line'
    }
  })
}
