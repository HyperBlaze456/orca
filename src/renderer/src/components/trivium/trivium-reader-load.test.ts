import { describe, expect, it } from 'vitest'
import {
  triviumNeedState,
  triviumWorkLoadState,
  type TriviumLoadState
} from './trivium-reader-load'
import type { TriviumWorkProgress } from './trivium-work-progress'

describe('triviumWorkLoadState', () => {
  it.each<[TriviumWorkProgress['source'], TriviumLoadState, TriviumLoadState, TriviumLoadState]>([
    // source, tickets, progress → work counts
    ['derived', 'ready', 'ready', 'ready'],
    ['derived', 'loading', 'ready', 'loading'],
    ['derived', 'error', 'ready', 'error'],
    ['derived', 'ready', 'error', 'ready'],
    ['recorded-work', 'error', 'ready', 'ready'],
    ['recorded-work', 'loading', 'ready', 'ready'],
    ['recorded-work', 'ready', 'loading', 'loading'],
    ['recorded-work', 'ready', 'error', 'ready']
  ])('%s work with tickets %s and progress %s is %s', (source, tickets, progress, expected) => {
    expect(triviumWorkLoadState({ tickets, progress }, { source })).toBe(expected)
  })
})

describe('triviumNeedState', () => {
  it('lets an error win over loading', () => {
    const loadState = { tickets: 'loading', progress: 'error', retry: () => {} } as const
    expect(triviumNeedState(loadState, ['tickets', 'progress'])).toBe('error')
    expect(triviumNeedState(loadState, ['tickets'])).toBe('loading')
  })
})
