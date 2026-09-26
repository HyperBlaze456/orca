import type { TriviumWorkProgress } from './trivium-work-progress'

/** How far one detail projection has come; status data is always loaded before the reader shows. */
export type TriviumLoadState = 'loading' | 'ready' | 'error'

/** What the page shell reports about the ticket and progress projections. */
export type TriviumReaderLoadState = {
  tickets: TriviumLoadState
  progress: TriviumLoadState
  retry: () => void
}

/** The two projection states without Retry, for parts that only read them. */
export type TriviumDetailStates = Pick<TriviumReaderLoadState, 'tickets' | 'progress'>

export const TRIVIUM_DETAILS_LOADED: TriviumDetailStates = { tickets: 'ready', progress: 'ready' }

export type TriviumReaderNeed = 'tickets' | 'progress'

/** The combined state of what a section reads: an error wins over loading. */
export function triviumNeedState(
  loadState: TriviumReaderLoadState,
  needs: readonly TriviumReaderNeed[]
): TriviumLoadState {
  const states = needs.map((need) => loadState[need])
  if (states.includes('error')) {
    return 'error'
  }
  return states.includes('loading') ? 'loading' : 'ready'
}

/**
 * Whether a Goal's work counts can be shown. Recorded work came with progress and stays shown
 * when ticket records fail; derived work counts ticket records, so it waits for them and is
 * unknown after they failed. AXIS A8: a missing count must never read as no work done.
 */
export function triviumWorkLoadState(
  loadState: TriviumDetailStates,
  work: Pick<TriviumWorkProgress, 'source'>
): TriviumLoadState {
  if (work.source === 'recorded-work') {
    return loadState.progress === 'loading' ? 'loading' : 'ready'
  }
  return loadState.tickets
}
