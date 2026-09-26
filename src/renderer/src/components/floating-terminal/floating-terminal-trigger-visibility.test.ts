import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { selectFloatingTerminalTriggerVisible } from './floating-terminal-trigger-visibility'

function triggerVisible(patch: Partial<GlobalSettings> | null, statusBarVisible: boolean): boolean {
  return selectFloatingTerminalTriggerVisible({
    settings: patch === null ? null : { ...getDefaultSettings('/tmp'), ...patch },
    statusBarVisible
  })
}

describe('selectFloatingTerminalTriggerVisible', () => {
  it('shows the trigger by default: enabled, as a floating button', () => {
    expect(triggerVisible({}, true)).toBe(true)
    expect(triggerVisible({}, false)).toBe(true)
  })

  it('hides the trigger while the feature is disabled, wherever it would sit', () => {
    for (const floatingTerminalTriggerLocation of ['floating-button', 'status-bar'] as const) {
      for (const statusBarVisible of [true, false]) {
        expect(
          triggerVisible(
            { floatingTerminalEnabled: false, floatingTerminalTriggerLocation },
            statusBarVisible
          )
        ).toBe(false)
      }
    }
  })

  it('hides the trigger until settings load: a boot-time null is not a user choice', () => {
    expect(triggerVisible(null, true)).toBe(false)
    expect(triggerVisible(null, false)).toBe(false)
  })

  it('moves the trigger into a visible status bar and back out when the bar is hidden', () => {
    const inStatusBar = { floatingTerminalTriggerLocation: 'status-bar' as const }
    expect(triggerVisible(inStatusBar, true)).toBe(false)
    expect(triggerVisible(inStatusBar, false)).toBe(true)
  })

  it('treats a missing location as the floating-button default', () => {
    const settings: Partial<GlobalSettings> = { floatingTerminalEnabled: true }
    const legacy = { ...getDefaultSettings('/tmp'), ...settings }
    // Older persisted settings can predate the location field.
    Reflect.deleteProperty(legacy, 'floatingTerminalTriggerLocation')
    expect(selectFloatingTerminalTriggerVisible({ settings: legacy, statusBarVisible: true })).toBe(
      true
    )
  })

  it('agrees with the shell hook rule it replaced for every input', () => {
    for (const floatingTerminalEnabled of [true, false]) {
      for (const floatingTerminalTriggerLocation of ['floating-button', 'status-bar'] as const) {
        for (const statusBarVisible of [true, false]) {
          const previousRule =
            floatingTerminalEnabled &&
            (floatingTerminalTriggerLocation === 'floating-button' || !statusBarVisible)
          expect(
            triggerVisible(
              { floatingTerminalEnabled, floatingTerminalTriggerLocation },
              statusBarVisible
            )
          ).toBe(previousRule)
        }
      }
    }
  })
})
