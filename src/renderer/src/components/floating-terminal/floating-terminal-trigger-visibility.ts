import type { AppState } from '../../store/types'

/** Whether the draggable floating-terminal trigger is on screen (it defaults to the bottom-right corner). */
export function selectFloatingTerminalTriggerVisible(
  state: Pick<AppState, 'settings' | 'statusBarVisible'>
): boolean {
  const location = state.settings?.floatingTerminalTriggerLocation ?? 'floating-button'
  return (
    state.settings?.floatingTerminalEnabled === true &&
    (location === 'floating-button' || !state.statusBarVisible)
  )
}
