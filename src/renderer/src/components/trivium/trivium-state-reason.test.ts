import { describe, expect, it } from 'vitest'
import { humanizeTriviumReason } from './trivium-harness-text'

// Every `state_reason` template trivium/view/status.py `_state` emits, with the plain text the
// page should read (order: strip `campaign.`, reword the milestone, fix "(s)" plurals).
describe('humanizeTriviumReason on trivium state reasons', () => {
  it('reads the review reason in singular and plural', () => {
    expect(
      humanizeTriviumReason(
        'Campaign campaign.alpha synthesized a milestone with 1 unknown(s) and 0 promotion candidate(s)'
      )
    ).toBe('Campaign alpha wrote a milestone summary with 1 unknown and 0 promotion candidates')
    expect(
      humanizeTriviumReason(
        'Campaign campaign.alpha synthesized a milestone with 12 unknown(s) and 2 promotion candidate(s)'
      )
    ).toBe('Campaign alpha wrote a milestone summary with 12 unknowns and 2 promotion candidates')
  })

  it('reads the paused and runnable reasons', () => {
    expect(
      humanizeTriviumReason('Campaign campaign.alpha.v2 is paused at an A2 boundary (goal-scope)')
    ).toBe('Campaign alpha.v2 is paused at an A2 boundary (goal-scope)')
    expect(
      humanizeTriviumReason('a Goal is adopted and no Campaign is open; a Campaign can start')
    ).toBe('a Goal is adopted and no Campaign is open; a Campaign can start')
  })

  it('fixes plurals on capitalized nouns', () => {
    expect(humanizeTriviumReason('1 Campaign(s) open, starting with campaign.alpha')).toBe(
      '1 Campaign open, starting with alpha'
    )
    expect(humanizeTriviumReason('3 Campaign(s) open, starting with campaign.alpha')).toBe(
      '3 Campaigns open, starting with alpha'
    )
    expect(
      humanizeTriviumReason('1 Feature(s) escalated to the user, starting with feature.risky')
    ).toBe('1 Feature escalated to the user, starting with feature.risky')
    expect(
      humanizeTriviumReason('2 Feature(s) escalated to the user, starting with feature.risky')
    ).toBe('2 Features escalated to the user, starting with feature.risky')
    expect(
      humanizeTriviumReason(
        'no adopted Goal yet; 1 Goal interview(s) open, starting with interview.scope'
      )
    ).toBe('no adopted Goal yet; 1 Goal interview open, starting with interview.scope')
    expect(
      humanizeTriviumReason(
        'no adopted Goal yet; 2 Goal interview(s) open, starting with interview.scope'
      )
    ).toBe('no adopted Goal yet; 2 Goal interviews open, starting with interview.scope')
  })

  it('leaves no "(s)" and agrees in number for every template and count', () => {
    const templates: [(n: number) => string, string[]][] = [
      [
        (n) => `no adopted Goal yet; ${n} Goal interview(s) open, starting with interview.a`,
        ['Goal interview']
      ],
      [(n) => `${n} Feature(s) escalated to the user, starting with feature.a`, ['Feature']],
      [(n) => `${n} Campaign(s) open, starting with campaign.a`, ['Campaign']],
      [
        (n) =>
          `Campaign campaign.a synthesized a milestone with ${n} unknown(s) and ${n} promotion candidate(s)`,
        ['unknown', 'promotion candidate']
      ]
    ]
    for (const [template, nouns] of templates) {
      for (const count of [0, 1, 2, 11]) {
        const text = humanizeTriviumReason(template(count))
        const expected = nouns.map((noun) => `${count} ${noun}${count === 1 ? '' : 's'}`)
        expect({ text, parenthesized: text.includes('(s)') }).toEqual({
          text,
          parenthesized: false
        })
        for (const phrase of expected) {
          expect(text).toMatch(new RegExp(`\\b${phrase}\\b`))
        }
      }
    }
  })
})
