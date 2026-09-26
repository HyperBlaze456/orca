import { describe, expect, it } from 'vitest'
import {
  orderTriviumTickets,
  resolveTriviumTicketKind,
  TRIVIUM_TICKET_LIST_ORDER,
  TRIVIUM_TICKET_TREE_ORDER,
  triviumTicketKindLabel,
  type TriviumTicketKind
} from './trivium-ticket-kinds'

const facts = {
  status: 'adopted',
  awaiting: null,
  listedAsCandidate: false,
  state: null
}

function source(
  kinds: Record<string, TriviumTicketKind>,
  dependsOn: Record<string, string[]> = {}
): Parameters<typeof orderTriviumTickets>[1] {
  return {
    ticketKind: (id) => kinds[id] ?? 'open',
    title: (id) => `Title ${id}`,
    dependsOn: (id) => dependsOn[id] ?? []
  }
}

describe('Trivium ticket kinds', () => {
  it('puts the approval wait before the workflow state', () => {
    expect(resolveTriviumTicketKind({ ...facts, status: 'candidate', state: 'done' })).toBe(
      'approval'
    )
    expect(resolveTriviumTicketKind({ ...facts, awaiting: 'approve', state: 'blocked' })).toBe(
      'approval'
    )
    expect(resolveTriviumTicketKind({ ...facts, listedAsCandidate: true, state: 'done' })).toBe(
      'approval'
    )
    expect(resolveTriviumTicketKind({ ...facts, state: 'blocked' })).toBe('blocked')
    expect(resolveTriviumTicketKind({ ...facts, state: 'abandoned' })).toBe('abandoned')
    expect(resolveTriviumTicketKind(facts)).toBe('open')
  })

  it('orders the list like Linear and the tree by what waits on the user', () => {
    expect(TRIVIUM_TICKET_LIST_ORDER).toEqual([
      'in-progress',
      'blocked',
      'open',
      'approval',
      'done',
      'abandoned'
    ])
    expect(TRIVIUM_TICKET_TREE_ORDER).toEqual([
      'approval',
      'blocked',
      'in-progress',
      'open',
      'done',
      'abandoned'
    ])
    expect(TRIVIUM_TICKET_LIST_ORDER.map(triviumTicketKindLabel)).toEqual([
      'In progress',
      'Blocked',
      'Open',
      'Needs approval',
      'Done',
      'Abandoned'
    ])
  })
})

describe('orderTriviumTickets', () => {
  it('seeds by kind then title and puts each dependency first', () => {
    const order = orderTriviumTickets(
      ['done-b', 'done-a', 'open-a', 'approval-a', 'blocked-a'],
      source(
        {
          'done-a': 'done',
          'done-b': 'done',
          'open-a': 'open',
          'approval-a': 'approval',
          'blocked-a': 'blocked'
        },
        { 'approval-a': ['done-b', 'outside'], 'blocked-a': ['open-a'] }
      )
    )
    expect(order).toEqual(['done-b', 'approval-a', 'open-a', 'blocked-a', 'done-a'])
  })

  it('breaks a dependency cycle and lists every ticket once', () => {
    const order = orderTriviumTickets(
      ['a', 'b', 'c', 'd', 'a'],
      source({}, { a: ['b'], b: ['c'], c: ['a'], d: ['c'] })
    )
    expect(order).toHaveLength(4)
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c', 'd']))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
    expect(orderTriviumTickets(['x'], source({}, { x: ['x'] }))).toEqual(['x'])
  })
})
