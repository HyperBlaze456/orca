import { cn } from '@/lib/utils'
import type { TriviumLoadState } from './trivium-reader-load'
import { TriviumProgressRing } from './TriviumIcons'

/**
 * A Goal's work ring by how far its counts are (`triviumWorkLoadState`): drawn when known, a
 * pulsing empty track while they load, and left out after they failed, because an empty ring
 * there would read as no work done.
 */
export function TriviumReaderWorkRing({
  state,
  fraction,
  size,
  dashed = false
}: {
  state: TriviumLoadState
  fraction: number
  size?: number
  dashed?: boolean
}): React.JSX.Element | null {
  if (state === 'error') {
    return null
  }
  return (
    <TriviumProgressRing
      size={size}
      fraction={state === 'ready' ? fraction : 0}
      dashed={dashed}
      className={cn(state === 'loading' && 'animate-pulse')}
    />
  )
}
