import { getIntlLocale } from '@/i18n/i18n'
import type { TriviumLoadState } from './trivium-reader-load'
import type { TriviumProjection } from './use-trivium-projection'
import type { TriviumWorkspaceStatusResult } from './use-trivium-workspace-status'

/**
 * What the reader may show from one detail projection. Data on screen stays `ready` through a
 * reload or a failed refresh (the header marks it stale), so a refresh never reads as missing.
 */
export function triviumProjectionLoadState(
  projection: Pick<TriviumProjection, 'data' | 'error' | 'loading'>
): TriviumLoadState {
  if (projection.data) {
    return 'ready'
  }
  return !projection.loading && projection.error !== undefined ? 'error' : 'loading'
}

/** Data a refresh could not replace; `since` is when the oldest of it arrived. */
export type TriviumStaleNotice = { since: number | null }

/**
 * Stale when a read failed while its earlier answer is still on screen. Loss of contact never
 * ends anything on the page: the last data stays, marked with the time it arrived.
 */
export function triviumStaleNotice(
  status: Pick<TriviumWorkspaceStatusResult, 'phase' | 'data' | 'updatedAt'>,
  projections: readonly Pick<TriviumProjection, 'data' | 'error' | 'updatedAt'>[]
): TriviumStaleNotice | null {
  const failed: (number | undefined)[] = []
  if (status.phase === 'error' && status.data) {
    failed.push(status.updatedAt)
  }
  for (const projection of projections) {
    if (projection.data && projection.error !== undefined) {
      failed.push(projection.updatedAt)
    }
  }
  if (failed.length === 0) {
    return null
  }
  const known = failed.filter((time): time is number => time !== undefined)
  return { since: known.length > 0 ? Math.min(...known) : null }
}

let clockFormat: { locale: string; format: Intl.DateTimeFormat } | null = null

/** "14:02": the stale notice names the time of day the shown data arrived. */
export function formatTriviumClockTime(time: number): string {
  const locale = getIntlLocale()
  if (clockFormat?.locale !== locale) {
    clockFormat = {
      locale,
      format: new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
    }
  }
  return clockFormat.format.format(time)
}
