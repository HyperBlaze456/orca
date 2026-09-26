import { describe, expect, it } from 'vitest'
import { indexTriviumGoalEdges } from './trivium-goal-edges'
import { readTriviumTickets } from './trivium-ticket-records'

describe('indexTriviumGoalEdges', () => {
  it('indexes both relations and ignores edges it cannot place', () => {
    const edges = indexTriviumGoalEdges(
      new Set(['goal.a', 'goal.b', 'ticket.c', 'ticket.d']),
      [
        { id: '1', source: 'goal.b', target: 'goal.a', relation: 'contributes-to' },
        { id: '2', source: 'goal.b', target: 'goal.a', relation: 'contributes-to' },
        { id: '3', source: 'ticket.c', target: 'goal.b', relation: 'contributes-to' },
        { id: '4', source: 'ticket.c', target: 'ticket.d', relation: 'depends-on' },
        { id: '5', source: 'ticket.c', target: 'goal.missing', relation: 'contributes-to' },
        { id: '6', source: 'goal.a', target: 'goal.a', relation: 'contributes-to' }
      ],
      readTriviumTickets({
        tickets: [
          { id: 'ticket.d', depends_on: ['ticket.c', 'ticket.unknown'] },
          { id: 'ticket.c', depends_on: ['ticket.d'] }
        ]
      })
    )
    expect(edges.parents.get('goal.b')).toEqual(['goal.a'])
    expect(edges.children.get('goal.a')).toEqual(['goal.b'])
    expect(edges.parents.get('ticket.c')).toEqual(['goal.b'])
    expect(edges.parents.has('goal.a')).toBe(false)
    expect(edges.dependsOn.get('ticket.c')).toEqual(['ticket.d'])
    // A dependency only the ticket record names still counts.
    expect(edges.dependsOn.get('ticket.d')).toEqual(['ticket.c'])
    expect(edges.requiredBy.get('ticket.d')).toEqual(['ticket.c'])
  })
})
