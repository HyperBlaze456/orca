import { describe, expect, it } from 'vitest'
import {
  formatTriviumClockTime,
  triviumProjectionLoadState,
  triviumStaleNotice
} from './trivium-page-load'
import { makeTriviumModelStatus } from './trivium-model-graph.fixture'

const DATA = { tickets: [] }
const status = makeTriviumModelStatus()

describe('triviumProjectionLoadState', () => {
  it('keeps data on screen ready through a reload and after a failed refresh', () => {
    expect(triviumProjectionLoadState({ data: DATA, error: undefined, loading: false })).toBe(
      'ready'
    )
    expect(triviumProjectionLoadState({ data: DATA, error: undefined, loading: true })).toBe(
      'ready'
    )
    expect(triviumProjectionLoadState({ data: DATA, error: 'Offline', loading: false })).toBe(
      'ready'
    )
  })

  it('loads until the first answer, fails without data, and loads again on Retry', () => {
    expect(triviumProjectionLoadState({ data: undefined, error: undefined, loading: true })).toBe(
      'loading'
    )
    expect(triviumProjectionLoadState({ data: undefined, error: 'Offline', loading: false })).toBe(
      'error'
    )
    expect(triviumProjectionLoadState({ data: undefined, error: 'Offline', loading: true })).toBe(
      'loading'
    )
  })
})

describe('triviumStaleNotice', () => {
  const fresh = { data: DATA, error: undefined, updatedAt: 3_000 }

  it('is quiet while every read that has data succeeded', () => {
    expect(triviumStaleNotice({ phase: 'ready', data: status, updatedAt: 2_000 }, [fresh])).toBe(
      null
    )
  })

  it('is quiet when a read failed with nothing on screen', () => {
    expect(
      triviumStaleNotice({ phase: 'error', data: null, updatedAt: undefined }, [
        { data: undefined, error: 'Offline', updatedAt: undefined }
      ])
    ).toBeNull()
  })

  it('dates stale data by the oldest failed read still on screen', () => {
    expect(
      triviumStaleNotice({ phase: 'error', data: status, updatedAt: 2_000 }, [
        fresh,
        { data: DATA, error: 'Offline', updatedAt: 1_000 }
      ])
    ).toEqual({ since: 1_000 })
    expect(
      triviumStaleNotice({ phase: 'ready', data: status, updatedAt: 2_000 }, [
        { data: DATA, error: 'Offline', updatedAt: 5_000 }
      ])
    ).toEqual({ since: 5_000 })
    expect(triviumStaleNotice({ phase: 'error', data: status, updatedAt: undefined }, [])).toEqual({
      since: null
    })
  })
})

describe('formatTriviumClockTime', () => {
  it('writes the hour on a 24-hour clock', () => {
    expect(formatTriviumClockTime(new Date(2026, 8, 26, 14, 2).getTime())).toBe('14:02')
    expect(formatTriviumClockTime(new Date(2026, 8, 26, 9, 5).getTime())).toBe('09:05')
  })
})
