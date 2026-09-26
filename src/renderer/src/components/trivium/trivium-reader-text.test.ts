import { describe, expect, it } from 'vitest'
import { triviumNeedState } from './trivium-reader-load'
import {
  formatTriviumCount,
  triviumContradictionCount,
  triviumFeatureResultKind,
  triviumOutcomeLabel,
  triviumOverviewHeadline,
  triviumShortRevision,
  triviumTheoryIdParts,
  triviumTicketsUnderSubGoals,
  triviumWorkText
} from './trivium-reader-text'

describe('reader text', () => {
  it('heads the Overview with what the state asks of the user', () => {
    expect(triviumOverviewHeadline('review')).toBe('A milestone is ready for your review')
    expect(triviumOverviewHeadline('paused')).toBe('A Campaign is paused until you decide')
    expect(triviumOverviewHeadline('no-adopted-goal')).toBe('No Goal has been adopted yet')
  })

  it('counts work as tickets done and names outcomes separately', () => {
    expect(triviumWorkText({ done: 13, total: 14 })).toBe('13/14 tickets done')
    expect(triviumWorkText({ done: 0, total: 0 })).toBe('No tickets yet')
    expect(triviumWorkText({ done: 1520, total: 2000 })).toBe('1,520/2,000 tickets done')
    expect(triviumOutcomeLabel('unassessed')).toBe('Not assessed')
    expect(triviumOutcomeLabel('not-achieved')).toBe('Not achieved')
  })

  it('pluralizes counted nouns', () => {
    expect(triviumContradictionCount(1)).toBe('1 contradiction')
    expect(triviumContradictionCount(0)).toBe('0 contradictions')
    expect(triviumTicketsUnderSubGoals(10)).toBe('All 10 tickets sit under sub-goals.')
    expect(triviumTicketsUnderSubGoals(1)).toBe('Its only ticket sits under a sub-goal.')
    expect(formatTriviumCount(1929)).toBe('1,929')
  })

  it('shortens revisions and splits Theory ids', () => {
    expect(triviumShortRevision('sha256:b7960e18a35a7009fafcd0')).toBe('b7960e18a35a')
    expect(triviumTheoryIdParts('invariant.journal-merge_3')).toEqual({
      kind: 'invariant',
      name: 'journal merge 3'
    })
    expect(triviumTheoryIdParts('plain')).toEqual({ kind: '', name: 'plain' })
  })

  it('maps Feature results onto ticket status icons', () => {
    expect(triviumFeatureResultKind('completed')).toBe('done')
    expect(triviumFeatureResultKind('deduplicated')).toBe('done')
    expect(triviumFeatureResultKind('queued')).toBe('open')
    expect(triviumFeatureResultKind('blocked')).toBe('blocked')
  })

  it('combines load states with errors first', () => {
    const retry = (): void => {}
    expect(triviumNeedState({ tickets: 'ready', progress: 'loading', retry }, ['tickets'])).toBe(
      'ready'
    )
    expect(
      triviumNeedState({ tickets: 'loading', progress: 'error', retry }, ['tickets', 'progress'])
    ).toBe('error')
    expect(
      triviumNeedState({ tickets: 'loading', progress: 'ready', retry }, ['tickets', 'progress'])
    ).toBe('loading')
  })
})
