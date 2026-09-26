import { describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import {
  buildTriviumTreeEntries,
  triviumCanonicalKey,
  triviumDefaultExpandedKeys,
  triviumKeyAncestors,
  triviumTreeOrder,
  type TriviumTreeEntry
} from './trivium-goal-tree'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeSmallTriviumStatus, makeTriviumFixtureModel } from './trivium-model.fixture'
import { readTriviumTickets } from './trivium-ticket-records'

function keys(entries: readonly TriviumTreeEntry[]): string[] {
  return entries.flatMap((entry) => [
    entry.key,
    ...(entry.kind === 'ticket' ? [] : keys(entry.children))
  ])
}

// Two roots, a Goal and a ticket under two parents, a hidden Goal with a shown child and a
// ticket with no parent at all.
const model = buildTriviumModel({
  status: makeSmallTriviumStatus(
    [
      ['goal.b-root', 'g1', 'adopted'],
      ['goal.a-root', 'g0', 'adopted'],
      ['goal.left', 'g2', 'adopted'],
      ['goal.right', 'g2', 'adopted'],
      ['goal.shared', 'g2', 'candidate'],
      ['goal.gone', 'g2', 'rejected'],
      ['goal.orphan-child', 'g2', 'adopted'],
      ['ticket.both', 'g3', 'adopted'],
      ['ticket.alone', 'g3', 'adopted'],
      ['ticket.under-gone', 'g3', 'adopted'],
      ['ticket.hidden', 'g3', 'retired']
    ],
    [
      ['goal.left', 'goal.a-root'],
      ['goal.right', 'goal.a-root'],
      ['goal.shared', 'goal.left'],
      ['goal.shared', 'goal.right'],
      ['goal.gone', 'goal.a-root'],
      ['goal.orphan-child', 'goal.gone'],
      ['ticket.both', 'goal.left'],
      ['ticket.both', 'goal.right'],
      ['ticket.under-gone', 'goal.gone'],
      ['ticket.hidden', 'goal.left']
    ]
  ),
  tickets: readTriviumTickets({ tickets: [{ id: 'ticket.both', parent: 'goal.right' }] }),
  progress: null
})

describe('buildTriviumTreeEntries', () => {
  it('builds the outline of the real-shaped fixture', () => {
    const [root, ...rest] = buildTriviumTreeEntries(makeTriviumFixtureModel())
    expect(rest).toEqual([])
    expect(root.kind === 'goal' && root.children.map((entry) => entry.id)).toEqual([
      G1_SEARCH,
      G1_SYNC
    ])
    const search = root.kind === 'goal' ? root.children[0] : null
    const group = search?.kind === 'goal' ? search.children[0] : null
    expect(group).toMatchObject({
      kind: 'group',
      id: `${G1_SEARCH}#tickets`,
      key: `${G0}>${G1_SEARCH}>${G1_SEARCH}#tickets`,
      parentId: G1_SEARCH
    })
    expect(group?.kind === 'group' && group.children[0].key).toBe(
      `${G0}>${G1_SEARCH}>${G1_SEARCH}#tickets>ticket.index-reads-once`
    )
    expect(keys([root])).toContain(`${G0}>${G1_SYNC}>${G2}>${G2}#tickets>ticket.sync-export`)
  })

  it('sorts roots by tier then title, repeats shared children and ends with unparented tickets', () => {
    const entries = buildTriviumTreeEntries(model)
    expect(entries.map((entry) => entry.key)).toEqual([
      'goal.a-root',
      'goal.b-root',
      'goal.orphan-child',
      'unparented#tickets'
    ])
    expect(entries.at(-1)).toMatchObject({
      kind: 'group',
      parentId: null,
      ticketIds: ['ticket.alone', 'ticket.under-gone']
    })
    const all = keys(entries)
    expect(all).toEqual(
      expect.arrayContaining([
        'goal.a-root>goal.left>goal.shared',
        'goal.a-root>goal.right>goal.shared',
        'goal.a-root>goal.left>goal.left#tickets>ticket.both',
        'goal.a-root>goal.right>goal.right#tickets>ticket.both'
      ])
    )
    expect(all.some((key) => key.includes('goal.gone') || key.includes('ticket.hidden'))).toBe(
      false
    )
  })
})

describe('Trivium tree keys', () => {
  it('opens an id at its first-parent chain, a ticket through its group', () => {
    expect(triviumCanonicalKey(model, 'goal.shared')).toBe('goal.a-root>goal.left>goal.shared')
    expect(triviumCanonicalKey(model, 'ticket.both')).toBe(
      'goal.a-root>goal.right>goal.right#tickets>ticket.both'
    )
    expect(triviumCanonicalKey(model, 'ticket.alone')).toBe('unparented#tickets>ticket.alone')
    expect(triviumCanonicalKey(model, 'goal.gone')).toBeNull()
    expect(triviumCanonicalKey(model, 'goal.unknown')).toBeNull()
    expect(triviumKeyAncestors('a>b>b#tickets>c')).toEqual(['a', 'a>b', 'a>b>b#tickets'])
    expect(triviumKeyAncestors('a')).toEqual([])
  })

  it('opens every Goal with children and keeps ticket groups closed', () => {
    expect([...triviumDefaultExpandedKeys(buildTriviumTreeEntries(model))]).toEqual([
      'goal.a-root',
      'goal.a-root>goal.left',
      'goal.a-root>goal.right'
    ])
    expect([
      ...triviumDefaultExpandedKeys(buildTriviumTreeEntries(makeTriviumFixtureModel()))
    ]).toEqual([G0, `${G0}>${G1_SEARCH}`, `${G0}>${G1_SYNC}`, `${G0}>${G1_SYNC}>${G2}`])
  })

  it('numbers Goals and tickets depth-first, first occurrence only', () => {
    const order = triviumTreeOrder(buildTriviumTreeEntries(model))
    expect([...order.keys()]).toEqual([
      'goal.a-root',
      'goal.left',
      'goal.shared',
      'ticket.both',
      'goal.right',
      'goal.b-root',
      'goal.orphan-child',
      'ticket.alone',
      'ticket.under-gone'
    ])
    expect(order.get('goal.left')).toBe(1)
  })
})
