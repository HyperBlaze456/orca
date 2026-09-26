import { describe, expect, it } from 'vitest'
import {
  humanizeTriviumReason,
  shortTriviumSha,
  triviumCampaignPhaseLabel,
  triviumCampaignPhaseNeedsUser,
  triviumIdSlug,
  triviumTierName
} from './trivium-harness-text'

describe('humanizeTriviumReason', () => {
  it('reads the milestone reason as plain text', () => {
    expect(
      humanizeTriviumReason(
        'Campaign campaign.n8-ticket-dogfood synthesized a milestone with 3 unknown(s) and 1 promotion candidate(s)'
      )
    ).toBe(
      'Campaign n8-ticket-dogfood wrote a milestone summary with 3 unknowns and 1 promotion candidate'
    )
  })

  it('keeps sentence punctuation, code spans and the other ids', () => {
    expect(humanizeTriviumReason('Paused campaign.alpha.v2. Run `trivium campaign resume`.')).toBe(
      'Paused alpha.v2. Run `trivium campaign resume`.'
    )
    expect(humanizeTriviumReason('goal.alpha has 0 open question(s) and 11 ticket(s)')).toBe(
      'goal.alpha has 0 open questions and 11 tickets'
    )
    expect(humanizeTriviumReason('1 escalation(s) waits on ticket.a')).toBe(
      '1 escalation waits on ticket.a'
    )
  })

  it('pluralizes the capitalized model nouns trivium counts', () => {
    expect(humanizeTriviumReason('2 Campaign(s) open, starting with campaign.a')).toBe(
      '2 Campaigns open, starting with a'
    )
    expect(humanizeTriviumReason('no adopted Goal yet; 1 Goal interview(s) open')).toBe(
      'no adopted Goal yet; 1 Goal interview open'
    )
  })
})

describe('Trivium harness words', () => {
  it('strips the kind prefix from ids', () => {
    expect(triviumIdSlug('campaign.ticket-dogfood')).toBe('ticket-dogfood')
    expect(triviumIdSlug('goal.notes-anywhere')).toBe('notes-anywhere')
    expect(triviumIdSlug('ticket.sync-export')).toBe('sync-export')
    expect(triviumIdSlug('feature.a')).toBe('a')
    expect(triviumIdSlug('proposal.x.milestone.1')).toBe('x.milestone.1')
    expect(triviumIdSlug('interview.scope')).toBe('scope')
    expect(triviumIdSlug('memory.keep')).toBe('memory.keep')
  })

  it('shortens commits and content hashes to seven characters', () => {
    expect(shortTriviumSha('c1a49ceedd2571c95aa8d4974a6d87f5c2c5feef')).toBe('c1a49ce')
    expect(shortTriviumSha('sha256:c26583c84aca545b')).toBe('c26583c')
    expect(shortTriviumSha('abc')).toBe('abc')
  })

  it('names tiers and Campaign phases', () => {
    expect(['g0', 'g1', 'g2', 'g3', 'g9'].map(triviumTierName)).toEqual([
      'Vision',
      'Outcome',
      'Campaign outcome',
      'Ticket',
      'G9'
    ])
    expect(
      [
        'started',
        'active',
        'paused',
        'milestone-reached',
        'milestone-recorded',
        'milestone-synthesized',
        'milestone-closed',
        'milestone-archived'
      ].map(triviumCampaignPhaseLabel)
    ).toEqual([
      'Started',
      'Running',
      'Paused',
      'Milestone reached',
      'Milestone recorded',
      'Milestone written',
      'Closed',
      'milestone-archived'
    ])
    expect(
      ['paused', 'milestone-reached', 'active', 'milestone-synthesized'].map(
        triviumCampaignPhaseNeedsUser
      )
    ).toEqual([true, true, false, false])
  })
})
