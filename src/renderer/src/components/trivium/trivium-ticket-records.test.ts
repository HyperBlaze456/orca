import { describe, expect, it } from 'vitest'
import {
  buildTriviumTicketPrompt,
  readTriviumTickets,
  ticketIsUnder,
  ticketParentIds
} from './trivium-ticket-records'
import { makeTriviumDesignStatus, makeTriviumTicketRecords } from './trivium-ticket-records.fixture'
import { makeTriviumModelTicketRecords } from './trivium-model-graph.fixture'
import { fixtureHex } from './trivium-model-tables.fixture'

describe('Trivium ticket projection', () => {
  it('preserves canonical IDs and keeps adoption independent from workflow', () => {
    const tickets = readTriviumTickets({ tickets: makeTriviumTicketRecords() })
    expect(tickets).toHaveLength(8)
    expect(tickets.find((ticket) => ticket.id === 'ticket.limits')).toMatchObject({
      state: 'open',
      status: 'candidate'
    })
    expect(tickets.filter((ticket) => ticket.state === 'done')).toHaveLength(3)
    expect(tickets[0].raw).not.toHaveProperty('acceptance_criteria')
    expect(tickets[0].raw).not.toHaveProperty('activity')
  })

  it('includes every contributing parent and ancestor without following dependencies', () => {
    const { goals } = makeTriviumDesignStatus()
    const ticket = readTriviumTickets({ tickets: makeTriviumTicketRecords() }).find(
      (item) => item.id === 'ticket.retry'
    )!
    expect(ticketParentIds(ticket, goals)).toEqual(['goal.retry', 'goal.recovery'])
    expect(ticketIsUnder(ticket, 'goal.purpose', goals)).toBe(true)
    expect(ticketIsUnder(ticket, 'goal.recovery', goals)).toBe(true)
    expect(ticketIsUnder(ticket, 'goal.persistence', goals)).toBe(false)
    goals.edges.push({
      id: 'cycle',
      source: 'goal.purpose',
      target: 'ticket.retry',
      relation: 'contributes-to'
    })
    expect(ticketIsUnder(ticket, 'goal.outcome', goals)).toBe(true)
    const prompt = buildTriviumTicketPrompt(ticket, goals, ' Verify retry. ')
    expect(prompt).toContain('Workflow: in-progress')
    expect(prompt).toContain('Adoption: adopted')
    expect(prompt).toContain('Contributes to: goal.retry, goal.recovery')
    expect(prompt).toContain('Depends on: ticket.checkpoint')
    expect(prompt).toContain('Requested change:\nVerify retry.')
  })

  it('distinguishes unsupported fields, empty fields and unreadable records', () => {
    const tickets = readTriviumTickets({
      tickets: [{ id: 'ticket.old' }, { id: 'ticket.empty', depends_on: [], state: 'future-state' }]
    })
    expect(tickets[0]).toMatchObject({ state: null, status: null, dependsOn: null })
    expect(tickets[1]).toMatchObject({ state: null, dependsOn: [] })
    expect(() => readTriviumTickets({ tickets: [null] })).toThrow('unreadable response')
  })
})

describe('Trivium ticket records from both binaries', () => {
  it('reads Feature runs, files, blocks and the approval wait', () => {
    const tickets = readTriviumTickets({ tickets: makeTriviumModelTicketRecords('head') })
    const candidate = tickets.find((ticket) => ticket.id === 'ticket.index-reads-once')
    expect(candidate).toMatchObject({
      status: 'candidate',
      state: 'done',
      awaiting: 'approve',
      approve: 'trivium model ticket approve ticket.index-reads-once --approved-by <user> --yes',
      blocks: 0,
      paths: ['src/notes/index-reads-once/part-0.ts', 'src/notes/index-reads-once/part-1.ts']
    })
    expect(candidate?.features).toEqual([
      {
        featureId: 'feature.index-reads-once',
        mergedCommit: fixtureHex('ticket.index-reads-once'),
        result: null,
        campaignId: null
      }
    ])
    const adopted = tickets.find((ticket) => ticket.id === 'ticket.sync-evaluation')
    expect(adopted).toMatchObject({ awaiting: null, approve: null, features: [] })
    expect(adopted?.paths).toHaveLength(30)
    const installed = readTriviumTickets({ tickets: makeTriviumModelTicketRecords('installed') })
    expect(installed.map((ticket) => ticket.approve)).toEqual(installed.map(() => null))
    expect(installed.filter((ticket) => ticket.awaiting === 'approve')).toHaveLength(3)
  })

  it('reads the progress Feature form, passes unknown statuses and drops malformed rows', () => {
    const [ticket] = readTriviumTickets({
      tickets: [
        {
          id: 'ticket.later',
          status: 'superseded-later',
          features: [
            { feature_id: 'feature.a', campaign_id: 'campaign.c', result: 'completed' },
            { merged_commit: 'abc123' },
            'junk',
            { feature_id: 'feature.b', result: 'exploded', merged_commit: '' }
          ],
          paths: ['src/a.ts', 3],
          blocks: 'many'
        }
      ]
    })
    expect(ticket.status).toBe('superseded-later')
    expect(ticket.features).toEqual([
      { featureId: 'feature.a', mergedCommit: null, result: 'completed', campaignId: 'campaign.c' },
      { featureId: 'feature.b', mergedCommit: null, result: null, campaignId: null }
    ])
    expect(ticket).toMatchObject({ paths: ['src/a.ts'], blocks: 0, awaiting: null, approve: null })
    expect(() => readTriviumTickets({ tickets: [{ title: 'No id' }] })).toThrow(
      'unreadable response'
    )
  })
})
