import { clampSidebarResizeWidth } from '@/hooks/useSidebarResize'
import { readTriviumPageStorage, writeTriviumPageStorage } from './trivium-page-storage'

export const TRIVIUM_SPLIT_DEFAULT_WIDTH = 440
export const TRIVIUM_SPLIT_MIN_WIDTH = 320
/** The structure pane never takes more than this share of the page. */
export const TRIVIUM_SPLIT_MAX_SHARE = 0.6
/** One arrow key press on the divider; Shift moves four steps. */
export const TRIVIUM_SPLIT_KEY_STEP = 16
/** A layout preference, so one key for every workspace. */
export const TRIVIUM_SPLIT_STORAGE_KEY = 'orca-trivium-page-v1:structure-width'

export type TriviumSplitBounds = { min: number; max: number }

/** The pane's width range on a page this wide; an unmeasured page (0) caps nothing. */
export function triviumSplitBounds(pageWidth: number): TriviumSplitBounds {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) {
    return { min: TRIVIUM_SPLIT_MIN_WIDTH, max: Number.POSITIVE_INFINITY }
  }
  return {
    min: TRIVIUM_SPLIT_MIN_WIDTH,
    max: Math.max(TRIVIUM_SPLIT_MIN_WIDTH, Math.floor(pageWidth * TRIVIUM_SPLIT_MAX_SHARE))
  }
}

export function clampTriviumSplitWidth(width: number, bounds: TriviumSplitBounds): number {
  return clampSidebarResizeWidth(Math.round(width), bounds.min, bounds.max)
}

/** The width after a key press on the focused divider; null for keys it leaves alone. */
export function triviumSplitKeyWidth(
  key: string,
  shiftKey: boolean,
  width: number,
  bounds: TriviumSplitBounds
): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
    return null
  }
  const step = TRIVIUM_SPLIT_KEY_STEP * (shiftKey ? 4 : 1)
  return clampTriviumSplitWidth(width + (key === 'ArrowLeft' ? -step : step), bounds)
}

/** The width the user last chose; the default when none is stored or it is unreadable. */
export function readTriviumSplitWidth(): number {
  const stored = readTriviumPageStorage(TRIVIUM_SPLIT_STORAGE_KEY)
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0
    ? stored
    : TRIVIUM_SPLIT_DEFAULT_WIDTH
}

export function writeTriviumSplitWidth(width: number): void {
  writeTriviumPageStorage(TRIVIUM_SPLIT_STORAGE_KEY, Math.round(width))
}
