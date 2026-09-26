import { describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries, triviumTreeOrder } from './trivium-goal-tree'
import { G1_SEARCH, G2 } from './trivium-model-tables.fixture'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import { makeReaderFixture, withTicketStates } from './trivium-reader-model.fixture'
import {
  filterTriviumTickets,
  groupTriviumTickets,
  sortTriviumTickets,
  triviumTicketMatches
} from './trivium-ticket-list-groups'
import { readTriviumTickets } from './trivium-ticket-records'

const MIXED = withTicketStates({
  'ticket.sync-journal': 'in-progress',
  'ticket.sync-refresh': 'blocked',
  'ticket.sync-evaluation': 'abandoned'
})

describe('ticket list grouping', () => {
  const { model, entries } = makeReaderFixture('head', MIXED)
  const order = triviumTreeOrder(entries)

  it('groups by status closest to done first, approval where Linear puts triage', () => {
    const groups = groupTriviumTickets(model, model.ticketIds, 'status', order)
    expect(groups.map((group) => group.key)).toEqual([
      'status:in-progress',
      'status:blocked',
      'status:open',
      'status:approval',
      'status:done',
      'status:abandoned'
    ])
    expect(groups.reduce((sum, group) => sum + group.ids.length, 0)).toBe(model.ticketIds.length)
  })

  it('never returns an empty group', () => {
    const ids = model.ticketIds.filter((id) => model.ticketKind(id) === 'done')
    expect(groupTriviumTickets(model, ids, 'status', order).map((group) => group.key)).toEqual([
      'status:done'
    ])
    expect(groupTriviumTickets(model, [], 'status', order)).toEqual([])
    expect(groupTriviumTickets(model, [], 'none', order)).toEqual([])
  })

  it('groups by parent Goal in outline order with parentless tickets last', () => {
    const status = makeSmallTriviumStatus(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.b', 'g1', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['ticket.under-b', 'g3', 'adopted'],
        ['ticket.under-a', 'g3', 'adopted'],
        ['ticket.loose', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['goal.b', 'goal.root'],
        ['ticket.under-b', 'goal.b'],
        ['ticket.under-a', 'goal.a']
      ]
    )
    const small = buildTriviumModel({ status, tickets: readTriviumTickets(), progress: null })
    const smallOrder = triviumTreeOrder(buildTriviumTreeEntries(small))
    const groups = groupTriviumTickets(small, small.ticketIds, 'goal', smallOrder)
    expect(groups.map((group) => [group.key, group.ids])).toEqual([
      ['goal:goal.a', ['ticket.under-a']],
      ['goal:goal.b', ['ticket.under-b']],
      ['goal:none', ['ticket.loose']]
    ])
    expect(
      groupTriviumTickets(model, model.ticketIds, 'goal', order).map((group) => group.key)
    ).toEqual([`goal:${G1_SEARCH}`, `goal:${G2}`])
  })

  it('keeps the incoming order inside a group', () => {
    const ids = sortTriviumTickets(model, model.ticketIds, 'title', order)
    for (const group of groupTriviumTickets(model, ids, 'status', order)) {
      expect(group.ids).toEqual(ids.filter((id) => group.ids.includes(id)))
    }
  })
})

describe('ticket list ordering and filters', () => {
  const { model, entries } = makeReaderFixture()
  const order = triviumTreeOrder(entries)

  it('orders by the outline (Goal order) or by title', () => {
    const byOutline = sortTriviumTickets(model, model.ticketIds, 'goal', order)
    expect(byOutline).toEqual([...order.keys()].filter((id) => model.isTicket(id)))
    const byTitle = sortTriviumTickets(model, model.ticketIds, 'title', order)
    const titles = byTitle.map((id) => model.title(id))
    expect(titles).toEqual(titles.toSorted(new Intl.Collator(undefined, { numeric: true }).compare))
  })

  it('matches title, statement and id without regard to case', () => {
    expect(triviumTicketMatches(model, 'ticket.trim-keeps-marker', 'FOLD line')).toBe(true)
    expect(triviumTicketMatches(model, 'ticket.trim-keeps-marker', 'trim-keeps')).toBe(true)
    const statement = model.node('ticket.sync-baseline')?.statement ?? ''
    expect(triviumTicketMatches(model, 'ticket.sync-baseline', statement.slice(5, 30))).toBe(true)
    expect(triviumTicketMatches(model, 'ticket.sync-baseline', 'no such words')).toBe(false)
    expect(triviumTicketMatches(model, 'ticket.sync-baseline', '   ')).toBe(true)
  })

  it('drops done and abandoned tickets when done tickets are hidden', () => {
    const mixed = makeReaderFixture('head', MIXED).model
    const kept = filterTriviumTickets(mixed, mixed.ticketIds, '', false)
    expect(new Set(kept.map((id) => mixed.ticketKind(id)))).toEqual(
      new Set(['in-progress', 'blocked', 'open', 'approval'])
    )
    expect(filterTriviumTickets(mixed, mixed.ticketIds, '', true)).toEqual(mixed.ticketIds)
  })
})
