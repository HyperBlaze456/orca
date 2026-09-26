import { describe, expect, it } from 'vitest'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import {
  buildTriviumTreeEntries,
  triviumCanonicalKey,
  triviumDefaultExpandedKeys,
  triviumTreeOrder,
  type TriviumTreeEntry
} from './trivium-goal-tree'
import { triviumGoalMilestones, triviumOpenQuestions } from './trivium-milestones'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import {
  makeSmallTriviumStatus,
  makeTriviumFixtureModel,
  makeTriviumModelInput
} from './trivium-model.fixture'
import { buildTriviumNeedsYou } from './trivium-needs-you'
import { makeRandomTriviumGraph } from './trivium-random-graph.fixture'
import { readTriviumTickets } from './trivium-ticket-records'
import { isTriviumRecord } from './trivium-workspace-query'

type Row = { key: string; entry: TriviumTreeEntry }

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isTriviumRecord) : []
}

function rows(entries: readonly TriviumTreeEntry[]): Row[] {
  return entries.flatMap((entry) => [
    { key: entry.key, entry },
    ...(entry.kind === 'ticket' ? [] : rows(entry.children))
  ])
}

function emptyAnswers(model: TriviumModel, id: string) {
  return {
    node: model.node(id),
    ticket: model.ticket(id),
    progressGoal: model.progressGoal(id),
    isShown: model.isShown(id),
    isTicket: model.isTicket(id),
    parents: model.parents(id),
    parent: model.parent(id),
    children: model.children(id),
    ancestors: model.ancestors(id),
    subGoals: model.subGoals(id),
    directTickets: model.directTickets(id),
    descendantGoals: model.descendantGoals(id),
    descendantTickets: model.descendantTickets(id),
    dependsOn: model.dependsOn(id),
    requiredBy: model.requiredBy(id),
    ticketKind: model.ticketKind(id),
    workState: model.workState(id),
    waitingOn: model.waitingOn(id),
    ticketFeatures: model.ticketFeatures(id),
    ticketCommit: model.ticketCommit(id),
    proposal: model.proposal(id),
    approveCommand: model.approveCommand(id),
    campaignGoal: model.campaignGoal(id),
    work: model.work(id),
    outcome: model.outcome(id),
    canonicalKey: triviumCanonicalKey(model, id)
  }
}

const EMPTY = {
  node: null,
  ticket: null,
  progressGoal: null,
  isShown: false,
  isTicket: false,
  parents: [],
  parent: null,
  children: [],
  ancestors: [],
  subGoals: [],
  directTickets: [],
  descendantGoals: [],
  descendantTickets: [],
  dependsOn: [],
  requiredBy: [],
  ticketKind: 'open',
  workState: 'open',
  waitingOn: [],
  ticketFeatures: [],
  ticketCommit: null,
  proposal: null,
  approveCommand: null,
  campaignGoal: null,
  work: { done: 0, total: 0, fraction: 0, completedFeatures: 0, source: 'derived' },
  outcome: 'unassessed',
  canonicalKey: null
}

describe('model answers for unknown ids', () => {
  it('answers every query with an empty value, loaded or loading', () => {
    const input = makeTriviumModelInput('head')
    const models = [
      makeTriviumFixtureModel('head'),
      makeTriviumFixtureModel('installed'),
      buildTriviumModel({ ...input, tickets: [], progress: null })
    ]
    for (const model of models) {
      for (const id of ['goal.nowhere', 'ticket.nowhere', '', 'campaign.sync-first-slice#x']) {
        expect(emptyAnswers(model, id)).toEqual({ ...EMPTY })
      }
      expect(model.title('ticket.nowhere')).toBe('nowhere')
      expect(model.ticketWork([])).toEqual({ done: 0, total: 0, fraction: 0 })
    }
  })
})

describe('hidden and unknown statuses', () => {
  const status = makeSmallTriviumStatus(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.next', 'g1', 'proposed-later'],
      ['goal.gone', 'g1', 'rejected'],
      ['goal.old', 'g1', 'retired'],
      ['goal.swapped', 'g1', 'replaced'],
      ['ticket.odd', 'g3', 'queued-for-review'],
      ['ticket.dead', 'g3', 'rejected'],
      ['ticket.under-old', 'g3', 'adopted']
    ],
    [
      ['goal.next', 'goal.root'],
      ['goal.gone', 'goal.root'],
      ['goal.old', 'goal.root'],
      ['goal.swapped', 'goal.root'],
      ['ticket.odd', 'goal.next'],
      ['ticket.dead', 'goal.next'],
      ['ticket.under-old', 'goal.old'],
      ['ticket.odd', 'ticket.dead', 'depends-on']
    ]
  )
  const model = buildTriviumModel({
    status,
    tickets: readTriviumTickets({
      tickets: [
        { id: 'ticket.odd', state: 'in-progress', status: 'queued-for-review' },
        { id: 'ticket.dead', state: 'open', status: 'rejected' }
      ]
    }),
    progress: null
  })
  const tree = rows(buildTriviumTreeEntries(model))

  it('shows an unknown status neutrally and hides rejected, retired and replaced', () => {
    expect(model.isShown('goal.next')).toBe(true)
    expect(model.isShown('ticket.odd')).toBe(true)
    expect(['goal.gone', 'goal.old', 'goal.swapped', 'ticket.dead'].some(model.isShown)).toBe(false)
    expect(model.children('goal.root')).toEqual(['goal.next'])
    expect(model.ticketIds).toEqual(['ticket.odd', 'ticket.under-old'])
    expect(model.ticketKind('ticket.odd')).toBe('in-progress')
    expect(model.dependsOn('ticket.odd')).toEqual([])
    expect(model.waitingOn('ticket.odd')).toEqual([])
    const ids = tree.map((row) => row.entry.id)
    for (const hidden of ['goal.gone', 'goal.old', 'goal.swapped', 'ticket.dead']) {
      expect(ids).not.toContain(hidden)
      expect(triviumCanonicalKey(model, hidden)).toBeNull()
    }
    // Its only parent is hidden, so the ticket falls into the unparented group.
    expect(model.unparentedTickets).toEqual(['ticket.under-old'])
    expect(triviumCanonicalKey(model, 'ticket.under-old')).toBe(
      'unparented#tickets>ticket.under-old'
    )
  })
})

describe('a G3 ticket whose id starts with goal.', () => {
  const model = makeTriviumFixtureModel('head')
  const tree = rows(buildTriviumTreeEntries(model))
  const id = 'goal.export-write-check'

  it('is a ticket everywhere, never a Goal row', () => {
    expect(model.isTicket(id)).toBe(true)
    expect(model.ticketIds).toContain(id)
    expect(model.directTickets(G1_SEARCH)).toContain(id)
    expect(model.subGoals(G1_SEARCH)).not.toContain(id)
    expect(model.descendantGoals(G0)).not.toContain(id)
    expect(model.rootGoals).not.toContain(id)
    const kinds = tree.filter((row) => row.entry.id === id).map((row) => row.entry.kind)
    expect(kinds).toEqual(['ticket'])
    expect(triviumCanonicalKey(model, id)).toBe(`${G0}>${G1_SEARCH}>${G1_SEARCH}#tickets>${id}`)
    expect(model.ticketKind(id)).toBe('open')
    expect(model.work(G1_SEARCH)).toMatchObject({ done: 3, total: 4 })
  })
})

describe('shared children, cycles and loading', () => {
  const status = makeSmallTriviumStatus(
    [
      ['goal.root', 'g0', 'adopted'],
      ['goal.a', 'g1', 'adopted'],
      ['goal.b', 'g1', 'adopted'],
      ['goal.shared', 'g2', 'adopted'],
      ['goal.loop-1', 'g2', 'adopted'],
      ['goal.loop-2', 'g2', 'adopted'],
      ['ticket.both', 'g3', 'adopted'],
      ['ticket.c1', 'g3', 'adopted'],
      ['ticket.c2', 'g3', 'adopted'],
      ['ticket.c3', 'g3', 'adopted'],
      ['ticket.self', 'g3', 'adopted']
    ],
    [
      ['goal.a', 'goal.root'],
      ['goal.b', 'goal.root'],
      ['goal.shared', 'goal.a'],
      ['goal.shared', 'goal.b'],
      ['ticket.both', 'goal.a'],
      ['ticket.both', 'goal.b'],
      ['goal.loop-1', 'goal.root'],
      ['goal.loop-1', 'goal.loop-2'],
      ['goal.loop-2', 'goal.loop-1'],
      ['ticket.c1', 'goal.shared'],
      ['ticket.c2', 'goal.shared'],
      ['ticket.c3', 'goal.shared'],
      ['ticket.self', 'goal.shared'],
      ['ticket.c1', 'ticket.c2', 'depends-on'],
      ['ticket.c2', 'ticket.c3', 'depends-on'],
      ['ticket.c3', 'ticket.c1', 'depends-on'],
      ['ticket.self', 'ticket.self', 'depends-on'],
      ['ticket.both', 'ticket.c1', 'depends-on'],
      ['ticket.c1', 'ticket.both', 'depends-on']
    ]
  )
  const model = buildTriviumModel({
    status,
    tickets: readTriviumTickets({
      tickets: [{ id: 'ticket.both', parent: 'goal.b', state: 'done' }]
    }),
    progress: null
  })
  const tree = rows(buildTriviumTreeEntries(model))
  const keys = tree.map((row) => row.key)

  it('lists a two-parent child under both parents and once in rollups', () => {
    expect(model.directTickets('goal.a')).toEqual(['ticket.both'])
    expect(model.directTickets('goal.b')).toEqual(['ticket.both'])
    expect(model.descendantTickets('goal.root').filter((id) => id === 'ticket.both')).toHaveLength(
      1
    )
    expect(model.descendantGoals('goal.root').filter((id) => id === 'goal.shared')).toHaveLength(1)
    expect(tree.filter((row) => row.entry.id === 'ticket.both').map((row) => row.key)).toEqual([
      'goal.root>goal.a>goal.a#tickets>ticket.both',
      'goal.root>goal.b>goal.b#tickets>ticket.both'
    ])
    expect(tree.filter((row) => row.entry.id === 'goal.shared')).toHaveLength(2)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain(triviumCanonicalKey(model, 'ticket.both'))
    expect(triviumCanonicalKey(model, 'ticket.both')).toBe(
      'goal.root>goal.b>goal.b#tickets>ticket.both'
    )
    const order = triviumTreeOrder(buildTriviumTreeEntries(model))
    expect([...order.values()]).toEqual([...order.keys()].map((_, index) => index))
  })

  it('orders a dependency cycle once each and survives a contribution cycle', () => {
    const group = model.directTickets('goal.shared')
    expect([...group].sort()).toEqual(['ticket.c1', 'ticket.c2', 'ticket.c3', 'ticket.self'])
    expect(model.dependsOn('ticket.self')).toEqual([])
    // ticket.both is done, so only ticket.c2 is waited on.
    expect(model.waitingOn('ticket.c1')).toEqual(['ticket.c2'])
    expect(model.ancestors('goal.loop-2')).toEqual(['goal.root', 'goal.loop-1'])
    expect(keys).toContain(triviumCanonicalKey(model, 'goal.loop-2'))
    expect(keys).toContain(triviumCanonicalKey(model, 'goal.loop-1'))
    for (const id of ['goal.shared', 'ticket.c3', 'goal.loop-1']) {
      expect(keys).toContain(triviumCanonicalKey(model, id))
    }
  })
})

describe('HEAD and installed binaries give the same page', () => {
  const head = makeTriviumFixtureModel('head')
  const installed = makeTriviumFixtureModel('installed')

  it('joins tickets, milestones and questions identically', () => {
    for (const id of head.ticketIds) {
      expect(installed.ticketFeatures(id).map((item) => item.id)).toEqual(
        head.ticketFeatures(id).map((item) => item.id)
      )
      expect(installed.ticketCommit(id)).toBe(head.ticketCommit(id))
      expect(installed.approveCommand(id)).toBe(head.approveCommand(id))
      const proposalOf = (model: TriviumModel) => {
        const proposal = model.proposal(id)
        return proposal && [proposal.featureId, proposal.approve, proposal.ticketId]
      }
      expect(proposalOf(installed)).toEqual(proposalOf(head))
      expect(installed.ticketKind(id)).toBe(head.ticketKind(id))
    }
    for (const id of [G0, G1_SYNC, G1_SEARCH, G2]) {
      expect(triviumGoalMilestones(installed, id)).toEqual(triviumGoalMilestones(head, id))
      expect(triviumOpenQuestions(installed, id)).toEqual(triviumOpenQuestions(head, id))
      const inSub = triviumGoalMilestones(head, id).inSubGoals.map(
        (item) => `${item.campaignId}/${item.proposalId}`
      )
      expect(new Set(inSub).size).toBe(inSub.length)
    }
    expect(buildTriviumNeedsYou(installed)).toEqual(buildTriviumNeedsYou(head))
  })

  it('repeats each Feature and derived outcome verbatim on every Goal that lists it', () => {
    // trivium `_goal` copies one Feature dict per Goal, so the copies are identical.
    for (const binary of ['head', 'installed'] as const) {
      const byFeature = new Map<string, string>()
      const byOutcome = new Map<string, string>()
      for (const goal of records(makeTriviumModelProgress(binary).goals)) {
        for (const feature of records(goal.completed)) {
          const id = String(feature.feature_id)
          const text = JSON.stringify(feature)
          expect({
            binary,
            goal: goal.goal_id,
            id,
            same: (byFeature.get(id) ?? text) === text
          }).toEqual({ binary, goal: goal.goal_id, id, same: true })
          byFeature.set(id, text)
        }
        for (const outcome of records(goal.derived_outcomes)) {
          const id = String(outcome.feature_id)
          const text = JSON.stringify(outcome)
          expect({
            binary,
            goal: goal.goal_id,
            id,
            same: (byOutcome.get(id) ?? text) === text
          }).toEqual({ binary, goal: goal.goal_id, id, same: true })
          byOutcome.set(id, text)
        }
      }
    }
    for (const id of head.ticketIds) {
      expect(installed.ticketFeatures(id)).toEqual(head.ticketFeatures(id))
      expect(installed.proposal(id)?.hypothesis).toBe(head.proposal(id)?.hypothesis)
    }
  })

  it('builds the page while projections load', () => {
    const input = makeTriviumModelInput('head')
    const loading = buildTriviumModel({ ...input, tickets: [], progress: null })
    expect(loading.ticketIds).toHaveLength(14)
    expect(buildTriviumNeedsYou(loading).map((item) => item.kind)).toEqual([
      'milestone',
      'candidate',
      'candidate',
      'candidate'
    ])
    expect(triviumGoalMilestones(loading, G2)).toEqual({ own: [], inSubGoals: [], latest: null })
    expect(loading.ticketKind('ticket.export-cutoff')).toBe('approval')
    const keys = rows(buildTriviumTreeEntries(loading)).map((row) => row.key)
    for (const node of loading.nodes) {
      expect(keys).toContain(triviumCanonicalKey(loading, node.id))
    }
  })
})

describe('tree properties on seeded random graphs', () => {
  it('shows every shown node, hides the rest and resolves every canonical key', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const graph = makeRandomTriviumGraph(seed)
      const model = buildTriviumModel({
        status: graph.status,
        tickets: readTriviumTickets({ tickets: graph.ticketRecords }),
        progress: null
      })
      const entries = buildTriviumTreeEntries(model)
      const tree = rows(entries)
      const keys = new Set(tree.map((row) => row.key))
      const ids = new Set(tree.flatMap((row) => (row.entry.kind === 'group' ? [] : [row.entry.id])))
      expect(keys.size).toBe(tree.length)
      for (const node of model.nodes) {
        const shown = model.isShown(node.id)
        expect({ seed, id: node.id, inTree: ids.has(node.id) }).toEqual({
          seed,
          id: node.id,
          inTree: shown
        })
        const key = triviumCanonicalKey(model, node.id)
        expect({ seed, id: node.id, resolves: key !== null && keys.has(key) }).toEqual({
          seed,
          id: node.id,
          resolves: shown
        })
      }
      for (const row of tree) {
        if (row.entry.kind === 'group') {
          const group = row.entry.ticketIds
          expect(new Set(group).size).toBe(group.length)
          group.forEach((id, index) => {
            for (const dependency of model.dependsOn(id)) {
              const at = group.indexOf(dependency)
              expect({ seed, id, dependency, before: at === -1 || at < index }).toEqual({
                seed,
                id,
                dependency,
                before: true
              })
            }
          })
        }
      }
      for (const key of triviumDefaultExpandedKeys(entries)) {
        expect(keys.has(key) && !key.endsWith('#tickets')).toBe(true)
      }
      expect(triviumTreeOrder(entries).size).toBe(ids.size)
    }
  })

  it('terminates on dependency cycles and lists every ticket once per group', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const graph = makeRandomTriviumGraph(seed, false)
      const model = buildTriviumModel({
        status: graph.status,
        tickets: readTriviumTickets({ tickets: graph.ticketRecords }),
        progress: null
      })
      for (const row of rows(buildTriviumTreeEntries(model))) {
        if (row.entry.kind === 'group') {
          expect(new Set(row.entry.ticketIds).size).toBe(row.entry.ticketIds.length)
          const parent = row.entry.parentId
          const expected = parent === null ? model.unparentedTickets : model.directTickets(parent)
          expect([...row.entry.ticketIds].sort()).toEqual([...expected].sort())
        }
      }
    }
  })
})
