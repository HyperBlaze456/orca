import { describe, expect, it } from 'vitest'
import { buildTriviumTreeEntries } from './trivium-goal-tree'
import { resolveTriviumTreeKey, triviumTreeTabKey } from './trivium-tree-keyboard'
import { everyOpenKey, makeSmallTreeModel, makeTreeRows } from './trivium-tree-model.fixture'

const model = makeSmallTreeModel()
const open = everyOpenKey(buildTriviumTreeEntries(model))
// 0 root, 1 a, 2 a1, 3 a1#tickets, 4 t.1, 5 t.2, 6 b, 7 b#tickets, 8 t.3
const rows = makeTreeRows(model, open)
const A1_GROUP = 'goal.root>goal.a>goal.a1>goal.a1#tickets'

describe('resolveTriviumTreeKey', () => {
  it('moves up and down one row and jumps with Home and End', () => {
    expect(resolveTriviumTreeKey(rows, 4, 'ArrowDown')).toEqual({ kind: 'select', index: 5 })
    expect(resolveTriviumTreeKey(rows, 4, 'ArrowUp')).toEqual({ kind: 'select', index: 3 })
    expect(resolveTriviumTreeKey(rows, 8, 'ArrowDown')).toBeNull()
    expect(resolveTriviumTreeKey(rows, 0, 'ArrowUp')).toBeNull()
    expect(resolveTriviumTreeKey(rows, 4, 'Home')).toEqual({ kind: 'select', index: 0 })
    expect(resolveTriviumTreeKey(rows, 4, 'End')).toEqual({ kind: 'select', index: 8 })
  })

  it('opens a closed row with → and steps into its first child once open', () => {
    const closed = makeTreeRows(model, new Set([...open].filter((key) => key !== A1_GROUP)))
    expect(resolveTriviumTreeKey(closed, 3, 'ArrowRight')).toEqual({
      kind: 'toggle',
      index: 3,
      open: true
    })
    expect(resolveTriviumTreeKey(rows, 3, 'ArrowRight')).toEqual({ kind: 'select', index: 4 })
    expect(resolveTriviumTreeKey(rows, 4, 'ArrowRight')).toBeNull()
  })

  it('closes an open row with ← and otherwise steps to the parent', () => {
    expect(resolveTriviumTreeKey(rows, 3, 'ArrowLeft')).toEqual({
      kind: 'toggle',
      index: 3,
      open: false
    })
    expect(resolveTriviumTreeKey(rows, 5, 'ArrowLeft')).toEqual({ kind: 'select', index: 3 })
    expect(resolveTriviumTreeKey(rows, 8, 'ArrowLeft')).toEqual({ kind: 'select', index: 7 })
    const collapsed = makeTreeRows(model, new Set())
    expect(resolveTriviumTreeKey(collapsed, 0, 'ArrowLeft')).toBeNull()
  })

  it('toggles with Enter and Space and selects a leaf', () => {
    expect(resolveTriviumTreeKey(rows, 1, 'Enter')).toEqual({
      kind: 'toggle',
      index: 1,
      open: false
    })
    expect(resolveTriviumTreeKey(makeTreeRows(model, new Set()), 0, ' ')).toEqual({
      kind: 'toggle',
      index: 0,
      open: true
    })
    expect(resolveTriviumTreeKey(rows, 4, 'Enter')).toEqual({ kind: 'select', index: 4 })
    expect(resolveTriviumTreeKey(rows, 4, 'a')).toBeNull()
    expect(resolveTriviumTreeKey(rows, -1, 'ArrowDown')).toBeNull()
  })

  it('moves along the filter’s fixed expansion instead of toggling', () => {
    // root ▾ > a ▾ > a1 ▾ > a1#tickets ▾ > t.2
    const filtered = makeTreeRows(model, new Set(), 't.2')
    expect(resolveTriviumTreeKey(filtered, 3, 'ArrowLeft')).toEqual({ kind: 'select', index: 2 })
    expect(resolveTriviumTreeKey(filtered, 3, 'ArrowRight')).toEqual({ kind: 'select', index: 4 })
    expect(resolveTriviumTreeKey(filtered, 2, 'Enter')).toEqual({ kind: 'select', index: 2 })
  })
})

describe('triviumTreeTabKey', () => {
  it('keeps the tab stop on the focused row until the selection changes elsewhere', () => {
    const t1 = `${A1_GROUP}>t.1`
    const t2 = `${A1_GROUP}>t.2`
    expect(triviumTreeTabKey(rows, { key: t1, selectedKey: null }, null)).toBe(t1)
    expect(triviumTreeTabKey(rows, { key: t1, selectedKey: null }, t2)).toBe(t2)
    expect(triviumTreeTabKey(rows, null, 'goal.root>goal.gone')).toBe('goal.root')
    expect(triviumTreeTabKey(rows, { key: 'goal.gone', selectedKey: null }, null)).toBe('goal.root')
    expect(triviumTreeTabKey([], null, null)).toBeNull()
  })
})
