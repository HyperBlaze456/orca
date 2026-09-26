import { describe, expect, it } from 'vitest'
import { buildTriviumTreeEntries, triviumDefaultExpandedKeys } from './trivium-goal-tree'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeTriviumFixtureModel } from './trivium-model.fixture'
import {
  everyOpenKey,
  makeSmallTreeModel,
  makeTreeRows as rowsFor
} from './trivium-tree-model.fixture'
import {
  splitTriviumTreeMatches,
  triviumTreeFilter,
  triviumTreeItemMatches,
  triviumTreeRowAriaExpanded,
  type TriviumTreeRow
} from './trivium-tree-rows'

const summary = (rows: readonly TriviumTreeRow[]): string[] =>
  rows.map((row) => `${'  '.repeat(row.depth)}${row.id}${row.expanded ? ' ▾' : ''}`)

describe('buildTriviumTreeRows', () => {
  it('shows Goals open and ticket groups closed by default on the real-shaped fixture', () => {
    const model = makeTriviumFixtureModel()
    const entries = buildTriviumTreeEntries(model)
    const rows = rowsFor(model, triviumDefaultExpandedKeys(entries))
    expect(summary(rows)).toEqual([
      `${G0} ▾`,
      `  ${G1_SEARCH} ▾`,
      `    ${G1_SEARCH}#tickets`,
      `  ${G1_SYNC} ▾`,
      `    ${G2} ▾`,
      `      ${G2}#tickets`
    ])
    expect(rows.map((row) => row.last)).toEqual([true, false, true, true, true, true])
    expect(rows[5].ancestorLast).toEqual([true, true, true])
    expect(rows.every((row) => row.toggleable && row.hasChildren && !row.dimmed)).toBe(true)
  })

  it('adds a group’s tickets when it opens and hides a closed Goal’s subtree', () => {
    const model = makeTriviumFixtureModel()
    const entries = buildTriviumTreeEntries(model)
    const group = `${G0}>${G1_SYNC}>${G2}>${G2}#tickets`
    const open = rowsFor(model, new Set([...triviumDefaultExpandedKeys(entries), group]))
    const tickets = open.filter((row) => row.parentKey === group)
    expect(tickets.map((row) => row.id)).toEqual(model.directTickets(G2))
    expect(tickets.every((row) => row.depth === 4 && !row.hasChildren)).toBe(true)
    expect(tickets.map((row) => row.last)).toEqual(tickets.map((_, index) => index === 9))
    expect(triviumTreeRowAriaExpanded(tickets[0])).toBeUndefined()

    const closed = rowsFor(model, new Set([G0, `${G0}>${G1_SEARCH}`]))
    expect(summary(closed)).toEqual([
      `${G0} ▾`,
      `  ${G1_SEARCH} ▾`,
      `    ${G1_SEARCH}#tickets`,
      `  ${G1_SYNC}`
    ])
    expect(triviumTreeRowAriaExpanded(closed[3])).toBe(false)
  })

  it('keeps the ancestors of a match, dims them and the groups, and opens the way to it', () => {
    const model = makeSmallTreeModel()
    // Nothing open: the filter overrides the saved expansion.
    const rows = rowsFor(model, new Set(), 'T.2')
    expect(summary(rows)).toEqual([
      'goal.root ▾',
      '  goal.a ▾',
      '    goal.a1 ▾',
      '      goal.a1#tickets ▾',
      '        t.2'
    ])
    expect(rows.map((row) => row.dimmed)).toEqual([true, true, true, true, false])
    expect(rows.every((row) => !row.toggleable)).toBe(true)
    expect(rows.map((row) => row.last)).toEqual([true, true, true, true, true])
    expect(rows.slice(0, 4).map(triviumTreeRowAriaExpanded)).toEqual([true, true, true, true])
  })

  it('shows a matching Goal without matching descendants closed and not expandable', () => {
    const model = makeSmallTreeModel()
    const rows = rowsFor(model, everyOpenKey(buildTriviumTreeEntries(model)), 'goal.b')
    expect(summary(rows)).toEqual(['goal.root ▾', '  goal.b'])
    expect(rows[1]).toMatchObject({ hasChildren: true, expanded: false, dimmed: false })
    expect(triviumTreeRowAriaExpanded(rows[1])).toBeUndefined()
  })

  it('matches titles, statements and ids case-insensitively', () => {
    const model = makeTriviumFixtureModel()
    const byId = triviumTreeFilter('SEARCH-OVERLAP')
    const byTitle = triviumTreeFilter('search와')
    const statement = model.node(G1_SYNC)?.statement ?? ''
    const byStatement = triviumTreeFilter(statement.slice(20, 40).toUpperCase())
    expect(byId && triviumTreeItemMatches(model, 'ticket.search-overlap-check', byId)).toBe(true)
    expect(byTitle && triviumTreeItemMatches(model, G1_SEARCH, byTitle)).toBe(true)
    expect(byStatement && triviumTreeItemMatches(model, G1_SYNC, byStatement)).toBe(true)
    expect(byId && triviumTreeItemMatches(model, G1_SYNC, byId)).toBe(false)
    expect(triviumTreeFilter('   ')).toBeNull()
  })

  it('lists no rows when nothing matches', () => {
    expect(rowsFor(makeSmallTreeModel(), new Set(), 'no such words')).toEqual([])
  })
})

describe('splitTriviumTreeMatches', () => {
  it('marks every case-insensitive occurrence and keeps the original text', () => {
    const segments = splitTriviumTreeMatches('Sync, sync and SYNC.', triviumTreeFilter('sync'))
    expect(segments.filter((part) => part.match).map((part) => part.text)).toEqual([
      'Sync',
      'sync',
      'SYNC'
    ])
    expect(segments.map((part) => part.text).join('')).toBe('Sync, sync and SYNC.')
    expect(segments.map((part) => part.offset)).toEqual([0, 4, 6, 10, 15, 19])
  })

  it('treats filter text literally and leaves unfiltered text whole', () => {
    expect(splitTriviumTreeMatches('a.b(c)', triviumTreeFilter('.b('))).toEqual([
      { offset: 0, text: 'a', match: false },
      { offset: 1, text: '.b(', match: true },
      { offset: 4, text: 'c)', match: false }
    ])
    expect(splitTriviumTreeMatches('Notes', null)).toEqual([
      { offset: 0, text: 'Notes', match: false }
    ])
    expect(splitTriviumTreeMatches('', triviumTreeFilter('x'))).toEqual([
      { offset: 0, text: '', match: false }
    ])
  })
})
