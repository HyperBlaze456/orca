import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeTriviumChange,
  diffTriviumSnapshots,
  readTriviumSnapshot,
  snapshotTriviumModel
} from './trivium-change-markers'
import { buildTriviumModel } from './trivium-goal-model'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import {
  readTriviumPageStorage,
  triviumPageStorageKey,
  writeTriviumPageStorage
} from './trivium-page-storage'

function model(edges: [string, string][], extra: [string, 'g2' | 'g3', string][] = []) {
  return buildTriviumModel({
    status: makeSmallTriviumStatus(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['goal.b', 'g1', 'adopted'],
        ['ticket.x', 'g3', 'adopted'],
        ...extra
      ],
      edges
    ),
    tickets: [],
    progress: null
  })
}

const titleOf = (id: string): string => `“${id}”`

describe('change marker edges', () => {
  it('does not report a parent reorder as a move', () => {
    const before = snapshotTriviumModel(
      model([
        ['ticket.x', 'goal.a'],
        ['ticket.x', 'goal.b']
      ]),
      1
    )
    const after = snapshotTriviumModel(
      model([
        ['ticket.x', 'goal.b'],
        ['ticket.x', 'goal.a']
      ]),
      2
    )
    expect(diffTriviumSnapshots(before, after).changes.size).toBe(0)
  })

  it('describes a dropped second parent without claiming a move under the kept one', () => {
    const before = snapshotTriviumModel(
      model([
        ['ticket.x', 'goal.a'],
        ['ticket.x', 'goal.b']
      ]),
      1
    )
    const after = snapshotTriviumModel(model([['ticket.x', 'goal.a']]), 2)
    const change = diffTriviumSnapshots(before, after).changes.get('ticket.x')
    expect(change).toEqual({
      kind: 'changed',
      fields: [{ field: 'parents', from: 'goal.a,goal.b', to: 'goal.a' }]
    })
    expect(change && describeTriviumChange(change, titleOf)).not.toBe('Moved under “goal.a”')
  })

  it('never claims a parent move that did not happen (every pair of parent sets)', () => {
    const goals = ['goal.a', 'goal.b', 'goal.root']
    const sets = Array.from({ length: 8 }, (_, mask) => goals.filter((_, bit) => mask & (1 << bit)))
    const snapshotOf = (parents: string[], seenAt: number) =>
      snapshotTriviumModel(
        model(parents.map((parent): [string, string] => ['ticket.x', parent])),
        seenAt
      )
    let pairs = 0
    for (const before of sets) {
      for (const after of sets) {
        if (before.join() === after.join()) {
          continue
        }
        pairs += 1
        const change = diffTriviumSnapshots(
          snapshotOf(before, 1),
          snapshotOf(after, 2)
        ).changes.get('ticket.x')
        const text = change ? describeTriviumChange(change, titleOf) : ''
        const added = after.filter((id) => !before.includes(id))
        const dropped = before.filter((id) => !after.includes(id))
        const match = /^(Moved under|Also under|No longer under) “([\w.-]+)”$/.exec(text)
        const [, wording, id] = match ?? []
        const truthful =
          (wording === 'Moved under' &&
            added.includes(id) &&
            (dropped.length > 0 || before.length === 0)) ||
          (wording === 'Also under' && added.includes(id) && dropped.length === 0) ||
          (wording === 'No longer under' && dropped.includes(id) && added.length === 0)
        expect({ before, after, text, truthful }).toEqual({ before, after, text, truthful: true })
      }
    }
    expect(pairs).toBe(56)
  })

  it('does not mark a node that arrives hidden, and lists one that turns hidden as removed', () => {
    const before = snapshotTriviumModel(model([['ticket.x', 'goal.a']]), 1)
    const after = snapshotTriviumModel(
      model([['ticket.x', 'goal.a']], [['ticket.gone', 'g3', 'rejected']]),
      2
    )
    expect(diffTriviumSnapshots(before, after).changes.size).toBe(0)
    const retired = snapshotTriviumModel(
      buildTriviumModel({
        status: makeSmallTriviumStatus(
          [
            ['goal.root', 'g0', 'adopted'],
            ['goal.a', 'g1', 'adopted'],
            ['goal.b', 'g1', 'adopted'],
            ['ticket.x', 'g3', 'retired']
          ],
          [['ticket.x', 'goal.a']]
        ),
        tickets: [],
        progress: null
      }),
      3
    )
    expect(diffTriviumSnapshots(before, retired)).toEqual({
      changes: new Map(),
      removed: [{ id: 'ticket.x', title: 'Title of ticket.x' }]
    })
  })

  it('does not report a stored parent list in another order as a change', () => {
    const now = snapshotTriviumModel(
      model([
        ['ticket.x', 'goal.a'],
        ['ticket.x', 'goal.b']
      ]),
      2
    )
    const stored = JSON.parse(JSON.stringify(now))
    stored.items['ticket.x'].parents = ['goal.b', 'goal.a', 'goal.b']
    expect(diffTriviumSnapshots(readTriviumSnapshot(stored), now).changes.size).toBe(0)
  })

  it('rejects stored values of the wrong shape', () => {
    for (const value of [[], 'x', 5, { items: [], seenAt: 1 }, { items: { a: [] }, seenAt: 1 }]) {
      expect(readTriviumSnapshot(value)).toBeNull()
    }
    expect(
      readTriviumSnapshot({
        seenAt: 1,
        items: {
          a: { title: 't', statementDigest: 'd', status: 's', tier: 'g1', parents: 'goal.root' }
        }
      })
    ).toBeNull()
  })
})

describe('page storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keys by workspace and harness root', () => {
    const key = triviumPageStorageKey('repo:1', '/srv/notes')
    expect(key).toContain('repo:1')
    expect(key).toContain('/srv/notes')
    expect(triviumPageStorageKey('repo:1', '/srv/other')).not.toBe(key)
    expect(triviumPageStorageKey('repo:2', '/srv/notes')).not.toBe(key)
    expect(triviumPageStorageKey('repo:1', null)).not.toBe(key)
  })

  it('never throws when storage is missing, denied or holds garbage', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readTriviumPageStorage('k')).toBeNull()
    expect(() => writeTriviumPageStorage('k', { a: 1 })).not.toThrow()
    const store = new Map<string, string>([['k', '{not json']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      }
    })
    expect(readTriviumPageStorage('k')).toBeNull()
    writeTriviumPageStorage('k', { a: 1 })
    expect(readTriviumPageStorage('k')).toEqual({ a: 1 })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => writeTriviumPageStorage('k', cyclic)).not.toThrow()
  })
})
