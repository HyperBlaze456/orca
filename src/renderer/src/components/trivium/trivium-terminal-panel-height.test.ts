// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TRIVIUM_TERMINAL_DEFAULT_HEIGHT,
  TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY,
  clampTriviumTerminalHeight,
  readTriviumTerminalHeight,
  triviumTerminalDragHeight,
  triviumTerminalHeightBounds,
  triviumTerminalKeyHeight,
  writeTriviumTerminalHeight
} from './trivium-terminal-panel-height'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('terminal panel bounds', () => {
  it('ranges from 120px to 70% of the space below the header, never below the minimum', () => {
    expect(triviumTerminalHeightBounds(1000)).toEqual({ min: 120, max: 700 })
    expect(triviumTerminalHeightBounds(851)).toEqual({ min: 120, max: 595 })
    expect(triviumTerminalHeightBounds(150)).toEqual({ min: 120, max: 120 })
  })

  it('caps nothing while the region is unmeasured or hidden', () => {
    for (const height of [0, -1, Number.NaN]) {
      expect(triviumTerminalHeightBounds(height)).toEqual({
        min: 120,
        max: Number.POSITIVE_INFINITY
      })
    }
  })

  it('clamps and rounds a height into the bounds', () => {
    const bounds = triviumTerminalHeightBounds(600)
    expect(clampTriviumTerminalHeight(40, bounds)).toBe(120)
    expect(clampTriviumTerminalHeight(9000, bounds)).toBe(420)
    expect(clampTriviumTerminalHeight(300.6, bounds)).toBe(301)
  })

  it('keeps a stored height on an unmeasured region', () => {
    const bounds = triviumTerminalHeightBounds(0)
    expect(clampTriviumTerminalHeight(900, bounds)).toBe(900)
    expect(clampTriviumTerminalHeight(10, bounds)).toBe(120)
  })
})

describe('separator keys and drag', () => {
  const bounds = triviumTerminalHeightBounds(800)

  it('grows 16px per ArrowUp and shrinks per ArrowDown, 64px with Shift, within the bounds', () => {
    expect(triviumTerminalKeyHeight('ArrowUp', false, 280, bounds)).toBe(296)
    expect(triviumTerminalKeyHeight('ArrowDown', false, 280, bounds)).toBe(264)
    expect(triviumTerminalKeyHeight('ArrowUp', true, 280, bounds)).toBe(344)
    expect(triviumTerminalKeyHeight('ArrowDown', true, 280, bounds)).toBe(216)
    expect(triviumTerminalKeyHeight('ArrowDown', true, 130, bounds)).toBe(120)
    expect(triviumTerminalKeyHeight('ArrowUp', true, 550, bounds)).toBe(560)
  })

  it('leaves every other key alone', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'Enter', ' ']) {
      expect(triviumTerminalKeyHeight(key, false, 280, bounds)).toBeNull()
    }
  })

  it('grows while the top edge moves up and shrinks while it moves down', () => {
    expect(triviumTerminalDragHeight(280, 500, 440, bounds)).toBe(340)
    expect(triviumTerminalDragHeight(280, 500, 560, bounds)).toBe(220)
    expect(triviumTerminalDragHeight(280, 500, 0, bounds)).toBe(560)
    expect(triviumTerminalDragHeight(280, 500, 900, bounds)).toBe(120)
  })
})

describe('stored height', () => {
  it('starts at 280px and returns the height last written', () => {
    expect(readTriviumTerminalHeight()).toBe(TRIVIUM_TERMINAL_DEFAULT_HEIGHT)
    writeTriviumTerminalHeight(333.4)
    expect(localStorage.getItem(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY)).toBe('333')
    expect(readTriviumTerminalHeight()).toBe(333)
  })

  it('falls back to the default for a missing or unreadable value', () => {
    expect(localStorage.getItem(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY)).toBeNull()
    expect(readTriviumTerminalHeight()).toBe(TRIVIUM_TERMINAL_DEFAULT_HEIGHT)
    for (const raw of ['"tall"', '-20', '0', 'null', '{', 'true', '[300]']) {
      localStorage.setItem(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY, raw)
      expect(readTriviumTerminalHeight()).toBe(TRIVIUM_TERMINAL_DEFAULT_HEIGHT)
    }
  })

  it('keeps working when storage throws', () => {
    // Why stubGlobal: happy-dom keeps a Storage spy past restoreAllMocks.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      }
    })
    expect(() => writeTriviumTerminalHeight(300)).not.toThrow()
    expect(readTriviumTerminalHeight()).toBe(TRIVIUM_TERMINAL_DEFAULT_HEIGHT)
  })
})
