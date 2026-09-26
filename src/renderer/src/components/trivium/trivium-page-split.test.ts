// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TRIVIUM_SPLIT_DEFAULT_WIDTH,
  TRIVIUM_SPLIT_STORAGE_KEY,
  clampTriviumSplitWidth,
  readTriviumSplitWidth,
  triviumSplitBounds,
  triviumSplitKeyWidth,
  writeTriviumSplitWidth
} from './trivium-page-split'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('structure pane bounds', () => {
  it('ranges from 320px to 60% of the page, and never below the minimum', () => {
    expect(triviumSplitBounds(1400)).toEqual({ min: 320, max: 840 })
    expect(triviumSplitBounds(1001)).toEqual({ min: 320, max: 600 })
    expect(triviumSplitBounds(480)).toEqual({ min: 320, max: 320 })
  })

  it('caps nothing while the page is unmeasured or hidden', () => {
    for (const width of [0, -1, Number.NaN]) {
      expect(triviumSplitBounds(width)).toEqual({ min: 320, max: Number.POSITIVE_INFINITY })
    }
  })

  it('clamps and rounds a width into the bounds', () => {
    const bounds = triviumSplitBounds(1000)
    expect(clampTriviumSplitWidth(100, bounds)).toBe(320)
    expect(clampTriviumSplitWidth(9000, bounds)).toBe(600)
    expect(clampTriviumSplitWidth(455.6, bounds)).toBe(456)
  })
})

describe('divider keys', () => {
  const bounds = triviumSplitBounds(1000)

  it('moves 16px per arrow, 64px with Shift, within the bounds', () => {
    expect(triviumSplitKeyWidth('ArrowRight', false, 440, bounds)).toBe(456)
    expect(triviumSplitKeyWidth('ArrowLeft', false, 440, bounds)).toBe(424)
    expect(triviumSplitKeyWidth('ArrowLeft', true, 440, bounds)).toBe(376)
    expect(triviumSplitKeyWidth('ArrowLeft', true, 330, bounds)).toBe(320)
    expect(triviumSplitKeyWidth('ArrowRight', true, 590, bounds)).toBe(600)
  })

  it('leaves every other key alone', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'Enter', ' ']) {
      expect(triviumSplitKeyWidth(key, false, 440, bounds)).toBeNull()
    }
  })
})

describe('stored width', () => {
  it('starts at 440px and returns the width last written', () => {
    expect(readTriviumSplitWidth()).toBe(TRIVIUM_SPLIT_DEFAULT_WIDTH)
    writeTriviumSplitWidth(512.4)
    expect(localStorage.getItem(TRIVIUM_SPLIT_STORAGE_KEY)).toBe('512')
    expect(readTriviumSplitWidth()).toBe(512)
  })

  it('ignores unreadable values', () => {
    for (const raw of ['"wide"', '-20', '0', 'null', '{']) {
      localStorage.setItem(TRIVIUM_SPLIT_STORAGE_KEY, raw)
      expect(readTriviumSplitWidth()).toBe(TRIVIUM_SPLIT_DEFAULT_WIDTH)
    }
  })

  it('keeps working when storage throws', () => {
    // Why stubGlobal: happy-dom keeps a Storage spy past restoreAllMocks, which made later tests fail.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      }
    })
    expect(() => writeTriviumSplitWidth(500)).not.toThrow()
    expect(readTriviumSplitWidth()).toBe(TRIVIUM_SPLIT_DEFAULT_WIDTH)
  })
})
