import { describe, expect, it } from 'vitest'
import type {
  TriviumGoalRelation,
  TriviumGoalTier
} from '../../../../shared/trivium-workspace-status'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import {
  buildTriviumTreeEntries,
  triviumDefaultExpandedKeys,
  triviumKeyAncestors
} from './trivium-goal-tree'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import { makeRandomTriviumGraph } from './trivium-random-graph.fixture'
import { buildTriviumTreeGutters, type TriviumTreeColumn } from './trivium-tree-connectors'
import { resolveTriviumTreeKey, triviumTreeTabKey } from './trivium-tree-keyboard'
import { everyOpenKey, makeTreeRows } from './trivium-tree-model.fixture'
import { readTriviumTickets } from './trivium-ticket-records'
import {
  splitTriviumTreeMatches,
  triviumTreeFilter,
  triviumTreeItemMatches,
  triviumTreeRowAriaExpanded,
  type TriviumTreeRow
} from './trivium-tree-rows'

// Verifier edge cases for the outline rows, connectors and keys (WO-2).

type NodeRow = [string, TriviumGoalTier, string]
type EdgeRow = [string, string, TriviumGoalRelation?]

function smallModel(
  nodes: NodeRow[],
  edges: EdgeRow[],
  text: Record<string, { title?: string; statement?: string }> = {}
): TriviumModel {
  const status = makeSmallTriviumStatus(nodes, edges)
  status.goals.nodes = status.goals.nodes.map((node) => ({ ...node, ...text[node.id] }))
  return buildTriviumModel({ status, tickets: [], progress: null })
}

/**
 * root ─┬─ a ── [t.shared, t.a]
 *       ├─ b ── [t.shared, t.b]
 *       ├─ c (leaf Goal)
 *       └─ d ── only a rejected child
 */
function twoParentModel(): TriviumModel {
  return smallModel(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.a', 'g1', 'adopted'],
      ['goal.b', 'g1', 'adopted'],
      ['goal.c', 'g1', 'adopted'],
      ['goal.d', 'g1', 'adopted'],
      ['goal.d-gone', 'g2', 'rejected'],
      ['t.shared', 'g3', 'adopted'],
      ['t.a', 'g3', 'adopted'],
      ['t.b', 'g3', 'adopted']
    ],
    [
      ['goal.a', 'goal.root'],
      ['goal.b', 'goal.root'],
      ['goal.c', 'goal.root'],
      ['goal.d', 'goal.root'],
      ['goal.d-gone', 'goal.d'],
      ['t.shared', 'goal.a'],
      ['t.shared', 'goal.b'],
      ['t.a', 'goal.a'],
      ['t.b', 'goal.b']
    ],
    {
      't.shared': { title: 'Shared ticket' },
      't.b': { statement: 'Mentions the Zebra crossing only here.' }
    }
  )
}

const summary = (rows: readonly TriviumTreeRow[]): string[] =>
  rows.map(
    (row) =>
      `${'  '.repeat(row.depth)}${row.id}${row.expanded ? ' ▾' : ''}${row.dimmed ? ' (dim)' : ''}`
  )

describe('filter edges', () => {
  const model = twoParentModel()
  const open = everyOpenKey(buildTriviumTreeEntries(model))

  it('matches a statement or an id without touching the title, trimmed and case-insensitive', () => {
    const byStatement = makeTreeRows(model, new Set(), '  zEBRA CROSSING  ')
    expect(summary(byStatement)).toEqual([
      'goal.root ▾ (dim)',
      '  goal.b ▾ (dim)',
      '    goal.b#tickets ▾ (dim)',
      '      t.b'
    ])
    // The row shows undimmed, but its title has nothing to mark.
    expect(
      splitTriviumTreeMatches(model.title('t.b'), triviumTreeFilter('zebra')).some(
        (part) => part.match
      )
    ).toBe(false)

    const filter = triviumTreeFilter('T.SHAR')
    expect(filter && triviumTreeItemMatches(model, 't.shared', filter)).toBe(true)
    expect(model.title('t.shared').toLowerCase().includes('t.shar')).toBe(false)
  })

  it('keeps both places of a ticket that sits under two parents', () => {
    const rows = makeTreeRows(model, new Set(), 'shared ticket')
    expect(summary(rows)).toEqual([
      'goal.root ▾ (dim)',
      '  goal.a ▾ (dim)',
      '    goal.a#tickets ▾ (dim)',
      '      t.shared',
      '  goal.b ▾ (dim)',
      '    goal.b#tickets ▾ (dim)',
      '      t.shared'
    ])
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
    // Last flags follow what the filter leaves: b is now the last child of root.
    expect(rows.map((row) => row.last)).toEqual([true, false, true, true, true, true, true])
  })

  it('dims a group row even when every ticket in it matches', () => {
    // `t.` is in every ticket id and in no Goal's title, statement or id.
    const rows = makeTreeRows(model, open, 't.')
    const groups = rows.filter((row) => row.entry.kind === 'group')
    expect(groups.map((row) => row.id)).toEqual(['goal.a#tickets', 'goal.b#tickets'])
    expect(groups.every((row) => row.dimmed)).toBe(true)
    const tickets = rows.filter((row) => row.entry.kind === 'ticket')
    expect(tickets.map((row) => row.id).sort()).toEqual(['t.a', 't.b', 't.shared', 't.shared'])
    expect(tickets.every((row) => !row.dimmed)).toBe(true)
    expect(rows.filter((row) => row.entry.kind === 'goal').every((row) => row.dimmed)).toBe(true)
  })

  it('treats every regex metacharacter literally and never throws', () => {
    const text = 'a(b)[c]{d}*+?.^$|\\/-e'
    for (const char of [
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '*',
      '+',
      '?',
      '.',
      '^',
      '$',
      '|',
      '\\',
      '/',
      '-'
    ]) {
      const filter = triviumTreeFilter(char)
      expect(() => makeTreeRows(model, open, char)).not.toThrow()
      const marked = splitTriviumTreeMatches(text, filter).filter((part) => part.match)
      expect(marked.map((part) => part.text)).toEqual([char])
    }
  })

  it('opens every row on the way to a match whatever the saved expansion says', () => {
    const closedAll = makeTreeRows(model, new Set(), 't.a')
    const openAll = makeTreeRows(model, open, 't.a')
    expect(summary(closedAll)).toEqual(summary(openAll))
    // Siblings with no match stay out even though they are saved open.
    expect(openAll.some((row) => row.id === 'goal.b')).toBe(false)
  })
})

describe('aria-expanded edges', () => {
  it('leaves it off a Goal with no children and off one whose only child is hidden', () => {
    const model = twoParentModel()
    const rows = makeTreeRows(model, everyOpenKey(buildTriviumTreeEntries(model)))
    const byId = (id: string): TriviumTreeRow => {
      const found = rows.find((row) => row.id === id)
      if (!found) {
        throw new Error(`no row for ${id}`)
      }
      return found
    }
    expect(byId('goal.c').hasChildren).toBe(false)
    expect(triviumTreeRowAriaExpanded(byId('goal.c'))).toBeUndefined()
    expect(byId('goal.d').hasChildren).toBe(false)
    expect(triviumTreeRowAriaExpanded(byId('goal.d'))).toBeUndefined()
    expect(triviumTreeRowAriaExpanded(byId('goal.a'))).toBe(true)
  })

  it('opens Goals and closes ticket groups by default', () => {
    const model = twoParentModel()
    const entries = buildTriviumTreeEntries(model)
    const rows = makeTreeRows(model, triviumDefaultExpandedKeys(entries))
    expect(summary(rows)).toEqual([
      'goal.root ▾',
      '  goal.a ▾',
      '    goal.a#tickets',
      '  goal.b ▾',
      '    goal.b#tickets',
      '  goal.c',
      '  goal.d'
    ])
    expect(
      rows.filter((row) => row.entry.kind === 'group').map(triviumTreeRowAriaExpanded)
    ).toEqual([false, false])
  })
})

// Guides as `│`, blanks as ` `, elbows as `├`/`└`; `*` = on the selected path, `|` = path passes.
function draw(column: TriviumTreeColumn): string {
  switch (column.kind) {
    case 'blank':
      return ' '
    case 'guide':
      return column.strong ? '│*' : '│'
    case 'elbow': {
      const glyph = column.joint === 'mid' ? '├' : '└'
      return column.strong === 'none' ? glyph : `${glyph}${column.strong === 'path' ? '*' : '|'}`
    }
  }
}

function picture(rows: readonly TriviumTreeRow[], selectedKey: string | null): string[] {
  return buildTriviumTreeGutters(rows, selectedKey).map((gutter, index) => {
    const down = gutter.down === 'none' ? '' : gutter.down === 'strong' ? 'v*' : 'v'
    return [...gutter.columns.map(draw), rows[index].id, down].filter(Boolean).join(' ')
  })
}

describe('connector edges', () => {
  // root ─┬─ a ─┬─ a1 ── [t.1]
  //       │     └─ a2
  //       └─ b
  const model = smallModel(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.a', 'g1', 'adopted'],
      ['goal.b', 'g1', 'adopted'],
      ['goal.a1', 'g2', 'adopted'],
      ['goal.a2', 'g2', 'adopted'],
      ['t.1', 'g3', 'adopted']
    ],
    [
      ['goal.a', 'goal.root'],
      ['goal.b', 'goal.root'],
      ['goal.a1', 'goal.a'],
      ['goal.a2', 'goal.a'],
      ['t.1', 'goal.a1']
    ]
  )
  const rows = makeTreeRows(model, everyOpenKey(buildTriviumTreeEntries(model)))

  it('carries guides past a non-last ancestor at every depth of a four-level outline', () => {
    expect(picture(rows, null)).toEqual([
      'goal.root v',
      '├ goal.a v',
      '│ ├ goal.a1 v',
      '│ │ └ goal.a1#tickets v',
      '│ │   └ t.1',
      '│ └ goal.a2',
      '└ goal.b'
    ])
    expect(picture(rows, 'goal.root>goal.a>goal.a1>goal.a1#tickets>t.1')).toEqual([
      'goal.root v*',
      '├* goal.a v*',
      '│ ├* goal.a1 v*',
      '│ │ └* goal.a1#tickets v*',
      '│ │   └* t.1',
      '│ └ goal.a2',
      '└ goal.b'
    ])
    expect(picture(rows, 'goal.root>goal.b')).toEqual([
      'goal.root v*',
      '├| goal.a v',
      '│* ├ goal.a1 v',
      '│* │ └ goal.a1#tickets v',
      '│* │   └ t.1',
      '│* └ goal.a2',
      '└* goal.b'
    ])
  })

  it('draws the path of a selected group row, and of a ticket reached through its second parent', () => {
    expect(picture(rows, 'goal.root>goal.a>goal.a1>goal.a1#tickets')).toEqual([
      'goal.root v*',
      '├* goal.a v*',
      '│ ├* goal.a1 v*',
      '│ │ └* goal.a1#tickets v',
      '│ │   └ t.1',
      '│ └ goal.a2',
      '└ goal.b'
    ])
    const shared = twoParentModel()
    const sharedRows = makeTreeRows(shared, everyOpenKey(buildTriviumTreeEntries(shared)))
    const lines = picture(sharedRows, 'goal.root>goal.b>goal.b#tickets>t.shared')
    const strongRows = sharedRows
      .filter((_, index) => lines[index].includes('*'))
      .map((row) => row.key)
    expect(strongRows).toEqual([
      'goal.root',
      // a and its rows only carry the root's line past them.
      'goal.root>goal.a>goal.a#tickets',
      'goal.root>goal.a>goal.a#tickets>t.shared',
      'goal.root>goal.a>goal.a#tickets>t.a',
      'goal.root>goal.b',
      'goal.root>goal.b>goal.b#tickets',
      'goal.root>goal.b>goal.b#tickets>t.shared'
    ])
    expect(lines[sharedRows.findIndex((row) => row.key === 'goal.root>goal.a')]).toBe('├| goal.a v')
  })

  it('keeps column counts and depths consistent on random outlines', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const graph = makeRandomTriviumGraph(seed)
      const random = buildTriviumModel({
        status: graph.status,
        tickets: readTriviumTickets({ tickets: graph.ticketRecords }),
        progress: null
      })
      const entries = buildTriviumTreeEntries(random)
      const keys = [...everyOpenKey(entries)].filter((_, index) => (index + seed) % 3 !== 0)
      const randomRows = makeTreeRows(random, new Set(keys))
      const seen = new Set<string>()
      const selected = randomRows[seed % Math.max(1, randomRows.length)]?.key ?? null
      const gutters = buildTriviumTreeGutters(randomRows, selected)
      randomRows.forEach((row, index) => {
        expect(triviumKeyAncestors(row.key)).toHaveLength(row.depth)
        expect(row.ancestorLast).toHaveLength(row.depth)
        expect(row.parentKey === null || seen.has(row.parentKey)).toBe(true)
        expect(gutters[index].columns).toHaveLength(row.depth)
        seen.add(row.key)
      })
    }
  })
})

describe('keyboard edges', () => {
  const model = twoParentModel()

  it('does nothing on → for a Goal the filter keeps closed, and selects it on Enter', () => {
    // goal.b matches by title; its tickets do not.
    const rows = makeTreeRows(model, new Set(), 'title of goal.b')
    const index = rows.findIndex((row) => row.id === 'goal.b')
    expect(rows[index]).toMatchObject({ hasChildren: true, expanded: false, toggleable: false })
    expect(resolveTriviumTreeKey(rows, index, 'ArrowRight')).toBeNull()
    expect(resolveTriviumTreeKey(rows, index, 'Enter')).toEqual({ kind: 'select', index })
    expect(resolveTriviumTreeKey(rows, index, ' ')).toEqual({ kind: 'select', index })
    expect(resolveTriviumTreeKey(rows, index, 'ArrowLeft')).toEqual({ kind: 'select', index: 0 })
  })

  it('toggles a group on Enter, selects a leaf Goal on Space and ignores other keys', () => {
    const rows = makeTreeRows(model, triviumDefaultExpandedKeys(buildTriviumTreeEntries(model)))
    const group = rows.findIndex((row) => row.id === 'goal.a#tickets')
    const leaf = rows.findIndex((row) => row.id === 'goal.c')
    expect(resolveTriviumTreeKey(rows, group, 'Enter')).toEqual({
      kind: 'toggle',
      index: group,
      open: true
    })
    expect(resolveTriviumTreeKey(rows, leaf, ' ')).toEqual({ kind: 'select', index: leaf })
    expect(resolveTriviumTreeKey(rows, leaf, 'ArrowRight')).toBeNull()
    expect(resolveTriviumTreeKey(rows, leaf, 'ArrowLeft')).toEqual({ kind: 'select', index: 0 })
    for (const key of ['Tab', 'Escape', 'PageDown', 'a', '*']) {
      expect(resolveTriviumTreeKey(rows, leaf, key)).toBeNull()
    }
    expect(resolveTriviumTreeKey([], 0, 'Home')).toBeNull()
    expect(resolveTriviumTreeKey(rows.slice(0, 1), 0, 'End')).toEqual({ kind: 'select', index: 0 })
  })

  it('moves the tab stop to the selection when the focused row is folded away', () => {
    const entries = buildTriviumTreeEntries(model)
    const open = everyOpenKey(entries)
    const focusKey = 'goal.root>goal.a>goal.a#tickets>t.a'
    const closed = makeTreeRows(
      model,
      new Set([...open].filter((key) => key !== 'goal.root>goal.a>goal.a#tickets'))
    )
    expect(
      triviumTreeTabKey(closed, { key: focusKey, selectedKey: null }, 'goal.root>goal.b')
    ).toBe('goal.root>goal.b')
    expect(triviumTreeTabKey(closed, { key: focusKey, selectedKey: null }, null)).toBe('goal.root')
  })
})
