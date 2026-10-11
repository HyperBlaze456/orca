import { readTriviumPageStorage, writeTriviumPageStorage } from './trivium-page-storage'

export const TRIVIUM_TERMINAL_DEFAULT_HEIGHT = 280
export const TRIVIUM_TERMINAL_MIN_HEIGHT = 120
/** The panel never takes more than this share of the space below the page header. */
export const TRIVIUM_TERMINAL_MAX_SHARE = 0.7
/** One arrow key press on the separator; Shift moves four steps. */
export const TRIVIUM_TERMINAL_KEY_STEP = 16
/** A layout preference, so one key for every workspace. */
export const TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY = 'orca-trivium-page-v1:terminal-height'

export type TriviumTerminalHeightBounds = { min: number; max: number }

/** The panel's height range below a header this tall; an unmeasured region (0) caps nothing. */
export function triviumTerminalHeightBounds(regionHeight: number): TriviumTerminalHeightBounds {
  if (!Number.isFinite(regionHeight) || regionHeight <= 0) {
    return { min: TRIVIUM_TERMINAL_MIN_HEIGHT, max: Number.POSITIVE_INFINITY }
  }
  return {
    min: TRIVIUM_TERMINAL_MIN_HEIGHT,
    max: Math.max(
      TRIVIUM_TERMINAL_MIN_HEIGHT,
      Math.floor(regionHeight * TRIVIUM_TERMINAL_MAX_SHARE)
    )
  }
}

export function clampTriviumTerminalHeight(
  height: number,
  bounds: TriviumTerminalHeightBounds
): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(height)))
}

/** The height after a key press on the focused separator; null for keys it leaves alone. */
export function triviumTerminalKeyHeight(
  key: string,
  shiftKey: boolean,
  height: number,
  bounds: TriviumTerminalHeightBounds
): number | null {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') {
    return null
  }
  const step = TRIVIUM_TERMINAL_KEY_STEP * (shiftKey ? 4 : 1)
  return clampTriviumTerminalHeight(height + (key === 'ArrowUp' ? step : -step), bounds)
}

/** The height while dragging the top edge: moving up grows the panel. */
export function triviumTerminalDragHeight(
  startHeight: number,
  startY: number,
  clientY: number,
  bounds: TriviumTerminalHeightBounds
): number {
  return clampTriviumTerminalHeight(startHeight + startY - clientY, bounds)
}

/** The height the user last chose; the default when none is stored or it is unreadable. */
export function readTriviumTerminalHeight(): number {
  const stored = readTriviumPageStorage(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY)
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0
    ? stored
    : TRIVIUM_TERMINAL_DEFAULT_HEIGHT
}

export function writeTriviumTerminalHeight(height: number): void {
  writeTriviumPageStorage(TRIVIUM_TERMINAL_HEIGHT_STORAGE_KEY, Math.round(height))
}
