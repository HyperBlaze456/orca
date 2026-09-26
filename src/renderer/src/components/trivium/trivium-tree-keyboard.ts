import type { TriviumTreeRow } from './trivium-tree-rows'

/** What a key does on the focused row: select (and focus) a row, or open or close one. */
export type TriviumTreeKeyAction =
  | { kind: 'select'; index: number }
  | { kind: 'toggle'; index: number; open: boolean }

/** The row the user last moved focus to, and the selection at that moment. */
export type TriviumTreeFocus = { key: string; selectedKey: string | null }

/**
 * The row holding the tree's single tab stop: the row focused last while the selection has not
 * changed elsewhere, else the selected row, else the first row.
 */
export function triviumTreeTabKey(
  rows: readonly TriviumTreeRow[],
  focus: TriviumTreeFocus | null,
  selectedKey: string | null
): string | null {
  const shown = (key: string | null): boolean => rows.some((row) => row.key === key)
  if (focus && focus.selectedKey === selectedKey && shown(focus.key)) {
    return focus.key
  }
  return shown(selectedKey) ? selectedKey : (rows[0]?.key ?? null)
}

/** Keys the tree owns while a row has focus; they never scroll the pane. */
export const TRIVIUM_TREE_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'Home',
  'End',
  'Enter',
  ' '
])

/**
 * ↑/↓ move and select, → opens a closed row or steps into its first child, ← closes an open
 * row or steps to its parent, Home/End jump, Enter/Space open or close (select a leaf).
 * Null when the key does nothing on this row.
 */
export function resolveTriviumTreeKey(
  rows: readonly TriviumTreeRow[],
  index: number,
  key: string
): TriviumTreeKeyAction | null {
  const row = rows[index]
  if (!row) {
    return null
  }
  switch (key) {
    case 'ArrowDown':
      return index + 1 < rows.length ? { kind: 'select', index: index + 1 } : null
    case 'ArrowUp':
      return index > 0 ? { kind: 'select', index: index - 1 } : null
    case 'Home':
      return { kind: 'select', index: 0 }
    case 'End':
      return { kind: 'select', index: rows.length - 1 }
    case 'ArrowRight':
      if (row.toggleable && !row.expanded) {
        return { kind: 'toggle', index, open: true }
      }
      return row.expanded && rows[index + 1]?.parentKey === row.key
        ? { kind: 'select', index: index + 1 }
        : null
    case 'ArrowLeft': {
      if (row.toggleable && row.expanded) {
        return { kind: 'toggle', index, open: false }
      }
      const parent = rows.findLastIndex(
        (candidate, position) => position < index && candidate.key === row.parentKey
      )
      return parent !== -1 ? { kind: 'select', index: parent } : null
    }
    case 'Enter':
    case ' ':
      return row.toggleable
        ? { kind: 'toggle', index, open: !row.expanded }
        : { kind: 'select', index }
    default:
      return null
  }
}
