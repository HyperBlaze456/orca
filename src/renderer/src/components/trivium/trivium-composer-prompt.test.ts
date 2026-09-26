import { describe, expect, it } from 'vitest'
import {
  buildTriviumComposerPrompt,
  describeTriviumItemForAgent,
  triviumApprovalRequest,
  triviumComposerChips
} from './trivium-composer-prompt'
import { fixtureApproveCommand, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeReaderFixture } from './trivium-reader-model.fixture'

describe('composer prompt', () => {
  const { model } = makeReaderFixture()

  it('describes a Goal by id, tier, relations and work kept apart from its outcome', () => {
    const context = describeTriviumItemForAgent(model, G2)
    expect(context.split('\n').slice(0, 5)).toEqual([
      'Trivium goal (selected on the Trivium page):',
      `ID: ${G2}`,
      'Tier: G2 (Campaign outcome)',
      'Status: adopted',
      `Title: ${model.title(G2)}`
    ])
    expect(context).toContain(`Contributes to: ${G1_SYNC} (${model.title(G1_SYNC)})`)
    expect(context).toContain('Work: 10/10 tickets done (work only; the outcome is unassessed)')
    expect(context.endsWith(model.node(G2)?.statement ?? '')).toBe(true)
  })

  it('describes a proposed ticket with its approval state and command', () => {
    const context = describeTriviumItemForAgent(model, 'ticket.export-cutoff')
    expect(context).toContain('Trivium ticket (selected on the Trivium page):')
    expect(context).toContain('Status: candidate')
    expect(context).toContain('Workflow state: done')
    expect(context).toContain('not part of the Goal model yet')
    expect(context).toContain(`Approve command: ${fixtureApproveCommand('ticket.export-cutoff')}`)
    expect(context).toContain('Depends on: ticket.sync-export')
    const adopted = describeTriviumItemForAgent(model, 'ticket.sync-baseline')
    expect(adopted).not.toContain('Approve command')
    expect(adopted).toContain('Required by: ticket.sync-journal')
  })

  it('puts the request after the context', () => {
    expect(buildTriviumComposerPrompt('Context line', '  Do this.\n')).toBe(
      'Context line\n\nRequest:\nDo this.'
    )
  })

  it('offers goal and ticket quick starts', () => {
    expect(triviumComposerChips(false)).toEqual([
      'Explain this goal',
      'Split into sub-goals',
      'Find conflicts'
    ])
    expect(triviumComposerChips(true)).toEqual([
      'Explain this ticket',
      'What does it depend on?',
      'Draft a plan'
    ])
  })

  it("writes an approval request in the user's voice with the command", () => {
    const request = triviumApprovalRequest(model, 'ticket.export-cutoff')
    expect(request).toBe(
      `I approve the proposed ticket “${model.title('ticket.export-cutoff')}” (ticket.export-cutoff). Adopt it by running this command with my name as the approver: ${fixtureApproveCommand('ticket.export-cutoff')}`
    )
    expect(triviumApprovalRequest(model, 'ticket.nowhere')).toContain(
      "Adopt it with trivium's ticket approve command"
    )
  })
})

describe('composer prompt while details are missing', () => {
  const withoutRecords = (binary: 'head' | 'installed') =>
    makeReaderFixture(binary, undefined, (input) => ({ ...input, tickets: [] })).model

  it('says what it cannot know instead of reading missing records as open or undone', () => {
    const model = withoutRecords('installed')
    expect(
      describeTriviumItemForAgent(model, G2, { tickets: 'error', progress: 'loading' })
    ).toContain(
      'Work: unknown, ticket records are not loaded (work only; the outcome is unknown, progress is not loaded)'
    )
    expect(
      describeTriviumItemForAgent(model, 'ticket.sync-export', {
        tickets: 'loading',
        progress: 'ready'
      })
    ).toContain('Workflow state: unknown, ticket records are not loaded')
  })

  it('keeps the work progress recorded when only ticket records failed', () => {
    expect(
      describeTriviumItemForAgent(withoutRecords('head'), G2, {
        tickets: 'error',
        progress: 'ready'
      })
    ).toContain('Work: 10/10 tickets done (work only; the outcome is unassessed)')
  })
})
