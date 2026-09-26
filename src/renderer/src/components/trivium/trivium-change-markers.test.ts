import { describe, expect, it } from 'vitest'
import {
  describeTriviumChange,
  diffTriviumSnapshots,
  readTriviumSnapshot,
  snapshotTriviumModel,
  type TriviumChange
} from './trivium-change-markers'
import { buildTriviumModel } from './trivium-goal-model'
import { makeSmallTriviumStatus, makeTriviumFixtureModel } from './trivium-model.fixture'

function smallModel(edit?: (status: ReturnType<typeof makeSmallTriviumStatus>) => void) {
  const status = makeSmallTriviumStatus(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.other', 'g1', 'adopted'],
      ['goal.moving', 'g2', 'candidate'],
      ['ticket.stays', 'g3', 'adopted'],
      ['ticket.leaves', 'g3', 'adopted'],
      ['ticket.retires', 'g3', 'adopted'],
      ['ticket.was-hidden', 'g3', 'rejected']
    ],
    [
      ['goal.other', 'goal.root'],
      ['goal.moving', 'goal.root'],
      ['ticket.stays', 'goal.moving'],
      ['ticket.leaves', 'goal.moving'],
      ['ticket.retires', 'goal.moving'],
      ['ticket.was-hidden', 'goal.moving']
    ]
  )
  edit?.(status)
  return buildTriviumModel({ status, tickets: [], progress: null })
}

const before = snapshotTriviumModel(smallModel(), 1000)
const after = snapshotTriviumModel(
  smallModel((status) => {
    const nodes = status.goals.nodes
    const moving = nodes[2]
    Object.assign(moving, {
      tier: 'g3',
      status: 'adopted',
      title: 'Renamed',
      statement: 'New text'
    })
    nodes.splice(4, 1)
    nodes[4].status = 'retired'
    nodes[5].status = 'adopted'
    nodes.push({ id: 'ticket.new', tier: 'g3', title: 'Fresh', statement: '', status: 'adopted' })
    status.goals.edges = status.goals.edges.map((edge) =>
      edge.source === 'goal.moving' ? { ...edge, target: 'goal.other' } : edge
    )
  }),
  2000
)

describe('Trivium change snapshots', () => {
  it('remember every goal node with a statement digest', () => {
    const snapshot = snapshotTriviumModel(makeTriviumFixtureModel(), 42)
    expect(Object.keys(snapshot.items)).toHaveLength(18)
    expect(snapshot.seenAt).toBe(42)
    expect(snapshot.modelRevision).toMatch(/^sha256:/)
    expect(before.items['ticket.stays']).toEqual({
      title: 'Title of ticket.stays',
      statementDigest: expect.stringMatching(/^[0-9a-f]{8}:0$/),
      status: 'adopted',
      tier: 'g3',
      parents: ['goal.moving']
    })
    expect(after.items['goal.moving'].statementDigest).not.toBe(
      before.items['goal.moving'].statementDigest
    )
    expect(readTriviumSnapshot(JSON.parse(JSON.stringify(after)))).toEqual(after)
  })

  it('reject stored values this build did not write', () => {
    expect(readTriviumSnapshot(null)).toBeNull()
    expect(readTriviumSnapshot({ items: {}, seenAt: 'yesterday' })).toBeNull()
    expect(readTriviumSnapshot({ items: { a: { title: 'x' } }, seenAt: 1 })).toBeNull()
    expect(readTriviumSnapshot({ items: {}, seenAt: 1 })).toEqual({
      modelRevision: null,
      seenAt: 1,
      items: {}
    })
  })
})

describe('diffTriviumSnapshots', () => {
  it('marks nothing without a previous visit', () => {
    expect(diffTriviumSnapshots(null, after)).toEqual({ changes: new Map(), removed: [] })
    expect(diffTriviumSnapshots(after, after).changes.size).toBe(0)
  })

  it('finds new, changed and removed items', () => {
    const { changes, removed } = diffTriviumSnapshots(before, after)
    expect(changes.get('ticket.new')).toEqual({ kind: 'new' })
    expect(changes.get('goal.moving')).toEqual({
      kind: 'changed',
      fields: [
        { field: 'tier', from: 'g2', to: 'g3' },
        { field: 'status', from: 'candidate', to: 'adopted' },
        { field: 'parents', from: 'goal.root', to: 'goal.other' },
        { field: 'title', from: 'Title of goal.moving', to: 'Renamed' },
        {
          field: 'statement',
          from: before.items['goal.moving'].statementDigest,
          to: after.items['goal.moving'].statementDigest
        }
      ]
    })
    expect(changes.get('ticket.was-hidden')).toEqual({
      kind: 'changed',
      fields: [{ field: 'status', from: 'rejected', to: 'adopted' }]
    })
    expect([...changes.keys()].sort()).toEqual(['goal.moving', 'ticket.new', 'ticket.was-hidden'])
    expect(removed).toEqual([
      { id: 'ticket.leaves', title: 'Title of ticket.leaves' },
      { id: 'ticket.retires', title: 'Title of ticket.retires' }
    ])
  })

  it('describes each change in words', () => {
    const titleOf = (id: string): string => `“${id}”`
    const change = diffTriviumSnapshots(before, after).changes.get('goal.moving')
    expect(change && describeTriviumChange(change, titleOf)).toBe(
      'Tier G2 → G3 · Status candidate → adopted · Moved under “goal.other” · Title changed · Description changed'
    )
    expect(describeTriviumChange({ kind: 'new' }, titleOf)).toBe('New since your last visit')
    const orphaned: TriviumChange = {
      kind: 'changed',
      fields: [{ field: 'parents', from: 'goal.root,goal.other', to: '' }]
    }
    expect(describeTriviumChange(orphaned, titleOf)).toBe('No longer under “goal.root”')
  })

  it('calls a parent change a move only when a new parent replaces an old one', () => {
    const titleOf = (id: string): string => `“${id}”`
    const parents = (from: string, to: string): string =>
      describeTriviumChange({ kind: 'changed', fields: [{ field: 'parents', from, to }] }, titleOf)
    expect(parents('goal.a,goal.b', 'goal.a')).toBe('No longer under “goal.b”')
    expect(parents('goal.a', 'goal.a,goal.b')).toBe('Also under “goal.b”')
    expect(parents('', 'goal.a')).toBe('Moved under “goal.a”')
    expect(parents('goal.a,goal.b', 'goal.a,goal.c')).toBe('Moved under “goal.c”')
  })

  it('reads stored parents as a sorted set', () => {
    const stored = readTriviumSnapshot({
      seenAt: 1,
      items: {
        a: { title: 't', statementDigest: 'd', status: 's', tier: 'g3', parents: ['b', 'a', 'b'] }
      }
    })
    expect(stored?.items.a.parents).toEqual(['a', 'b'])
  })
})
