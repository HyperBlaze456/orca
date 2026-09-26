import { describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import { G0, G1_SEARCH, G1_SYNC, G2, fixtureHex } from './trivium-model-tables.fixture'
import {
  makeSmallTriviumStatus,
  makeTriviumFixtureModel,
  makeTriviumModelInput
} from './trivium-model.fixture'
import { readTriviumProgress } from './trivium-progress-records'
import { readTriviumTickets } from './trivium-ticket-records'

describe('buildTriviumModel on the real-shaped fixture', () => {
  const model = makeTriviumFixtureModel()

  it('answers the graph queries', () => {
    expect(model.ticketIds).toHaveLength(14)
    expect(model.rootGoals).toEqual([G0])
    expect(model.unparentedTickets).toEqual([])
    expect(model.subGoals(G0)).toEqual([G1_SEARCH, G1_SYNC])
    expect(model.children(G1_SEARCH)).toHaveLength(4)
    expect(model.children('ticket.sync-export')).toEqual([])
    expect(model.parent('ticket.sync-export')).toBe(G2)
    expect(model.ancestors('ticket.sync-export')).toEqual([G0, G1_SYNC, G2])
    expect(model.ancestors(G0)).toEqual([])
    expect(model.dependsOn('ticket.sync-evaluation')).toHaveLength(3)
    expect(model.requiredBy('ticket.sync-baseline')).toEqual(
      expect.arrayContaining([
        'ticket.sync-journal',
        'ticket.sync-refresh',
        'ticket.sync-size-budget'
      ])
    )
    expect(model.descendantGoals(G0)).toEqual([G1_SEARCH, G1_SYNC, G2])
    expect(model.descendantTickets(G0)).toHaveLength(14)
    expect(model.descendantTickets(G1_SYNC)).toHaveLength(10)
    const direct = model.directTickets(G2)
    for (const id of direct) {
      for (const dependency of model.dependsOn(id)) {
        expect(direct.indexOf(dependency)).toBeLessThan(direct.indexOf(id))
      }
    }
    expect(model.revision).toBe(`sha256:${fixtureHex('revision', 64)}`)
    expect(model.reviewCampaignId).toBe('campaign.ticket-dogfood')
    expect(model.campaignGoal('campaign.sync-first-slice')).toBe(G2)
    expect(model.campaignGoal('campaign.unknown')).toBeNull()
    expect(model.outcome(G0)).toBe('unassessed')
  })

  it('joins kinds, commits, Features, proposals and approve commands', () => {
    expect(model.ticketKind('ticket.export-cutoff')).toBe('approval')
    expect(model.workState('ticket.export-cutoff')).toBe('done')
    expect(model.ticketKind('goal.export-write-check')).toBe('open')
    expect(model.ticketKind('ticket.sync-export')).toBe('done')
    // HEAD repeats the Feature on three Goals; the ticket lists it once.
    expect(model.ticketFeatures('ticket.sync-export')).toHaveLength(1)
    expect(model.ticketCommit('ticket.sync-export')).toBe(fixtureHex('ticket.sync-export'))
    expect(model.ticketCommit('goal.export-write-check')).toBeNull()
    expect(model.proposal('ticket.trim-keeps-marker')?.hypothesis).not.toBe('')
    expect(model.approveCommand('ticket.index-reads-once')).toBe(
      'trivium model ticket approve ticket.index-reads-once --approved-by <user> --yes'
    )
    expect(model.approveCommand('ticket.search-overlap-check')).toBe(
      'trivium model ticket ratify ticket.search-overlap-check --approved-by <user> --yes'
    )
    expect(model.approveCommand('ticket.sync-export')).toBeNull()
    expect(model.waitingOn('ticket.sync-evaluation')).toEqual([])
  })
})

describe('buildTriviumModel edge cases', () => {
  it('hides refused narrowings, ignores unknown endpoints and falls back for titles', () => {
    const status = makeSmallTriviumStatus(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.old', 'g1', 'retired'],
        ['goal.draft', 'g1', 'anticipated'],
        ['ticket.a', 'g3', 'adopted'],
        ['ticket.b', 'g3', 'rejected'],
        ['ticket.c', 'g3', 'replaced']
      ],
      [
        ['goal.old', 'goal.root'],
        ['goal.draft', 'goal.root'],
        ['ticket.a', 'goal.old'],
        ['ticket.b', 'goal.draft'],
        ['ticket.c', 'goal.missing'],
        ['ticket.a', 'ticket.b', 'depends-on']
      ]
    )
    status.goals.nodes[3].title = ''
    const model = buildTriviumModel({
      status,
      tickets: readTriviumTickets({
        tickets: [{ id: 'ticket.a', title: 'Record title', state: 'blocked' }]
      }),
      progress: null
    })
    expect(['goal.old', 'ticket.b', 'ticket.c', 'goal.x'].map(model.isShown)).toEqual([
      false,
      false,
      false,
      false
    ])
    expect(model.children('goal.root')).toEqual(['goal.draft'])
    expect(model.parents('ticket.a')).toEqual([])
    expect(model.unparentedTickets).toEqual(['ticket.a'])
    expect(model.ticketIds).toEqual(['ticket.a'])
    expect(model.dependsOn('ticket.a')).toEqual([])
    expect(model.title('ticket.a')).toBe('Record title')
    expect(model.title('ticket.unknown-thing')).toBe('unknown-thing')
    expect(model.node('goal.x')).toBeNull()
    expect(model.ticketKind('ticket.a')).toBe('blocked')
    expect(model.work('goal.root')).toMatchObject({ done: 0, total: 1, source: 'derived' })
    expect(model.ancestors('goal.x')).toEqual([])
  })

  it('leads with the recorded parent, marks waiting dependencies and survives a cycle', () => {
    const status = makeSmallTriviumStatus(
      [
        ['goal.a', 'g1', 'adopted'],
        ['goal.b', 'g1', 'adopted'],
        ['goal.loop-1', 'g2', 'adopted'],
        ['goal.loop-2', 'g2', 'adopted'],
        ['ticket.x', 'g3', 'adopted'],
        ['ticket.y', 'g3', 'candidate'],
        ['ticket.z', 'g3', 'adopted']
      ],
      [
        ['ticket.x', 'goal.a'],
        ['ticket.x', 'goal.b'],
        ['goal.loop-1', 'goal.loop-2'],
        ['goal.loop-2', 'goal.loop-1'],
        ['ticket.x', 'ticket.y', 'depends-on'],
        ['ticket.x', 'ticket.z', 'depends-on']
      ]
    )
    const model = buildTriviumModel({
      status,
      tickets: readTriviumTickets({
        tickets: [
          { id: 'ticket.x', parent: 'goal.b', state: 'open' },
          { id: 'ticket.y', state: 'done' },
          { id: 'ticket.z', state: 'abandoned', awaiting: 'approve', approve: 'record command' }
        ]
      }),
      progress: null
    })
    expect(model.parents('ticket.x')).toEqual(['goal.b', 'goal.a'])
    expect(model.ancestors('ticket.x')).toEqual(['goal.b'])
    expect(model.waitingOn('ticket.x')).toEqual(['ticket.z'])
    expect(model.ticketKind('ticket.y')).toBe('approval')
    expect(model.ticketKind('ticket.z')).toBe('approval')
    expect(model.approveCommand('ticket.z')).toBe('record command')
    expect(model.ancestors('goal.loop-1')).toEqual(['goal.loop-2'])
    expect(model.descendantGoals('goal.loop-1')).toEqual(['goal.loop-2'])
    expect(model.work('goal.loop-1').total).toBe(0)
  })
})

describe('work progress parity with trivium recorded_work', () => {
  const RECORDED: Record<string, [number, number, number]> = {
    [G0]: [13, 14, 16],
    [G1_SYNC]: [10, 10, 10],
    [G1_SEARCH]: [3, 4, 3],
    [G2]: [10, 10, 10]
  }

  it('uses recorded_work from HEAD and derives the same counts without it', () => {
    const head = makeTriviumModelInput('head')
    const withoutRecord = buildTriviumModel({
      ...head,
      progress: readTriviumProgress({
        ...makeTriviumModelProgress('head'),
        goals: (head.progress?.goals ?? []).map((goal) => ({ goal_id: goal.id }))
      })
    })
    const stripped = buildTriviumModel({
      ...head,
      progress: head.progress && {
        ...head.progress,
        goals: head.progress.goals.map((goal) => ({ ...goal, recordedWork: null }))
      }
    })
    const recorded = buildTriviumModel(head)
    const installed = makeTriviumFixtureModel('installed')
    for (const [goalId, [done, total, features]] of Object.entries(RECORDED)) {
      expect(recorded.work(goalId)).toMatchObject({ done, total, source: 'recorded-work' })
      expect(recorded.work(goalId).completedFeatures).toBe(features)
      for (const derived of [stripped, installed]) {
        expect(derived.work(goalId)).toEqual({
          ...recorded.work(goalId),
          source: 'derived'
        })
      }
      expect(withoutRecord.work(goalId)).toMatchObject({ done, total, source: 'derived' })
    }
  })

  it('counts a finished candidate as done and a chosen set of tickets directly', () => {
    const model = makeTriviumFixtureModel('installed')
    expect(model.ticketWork(model.directTickets(G2))).toEqual({ done: 10, total: 10, fraction: 1 })
    expect(model.ticketWork(['goal.export-write-check', 'ticket.export-cutoff'])).toEqual({
      done: 1,
      total: 2,
      fraction: 0.5
    })
  })
})
