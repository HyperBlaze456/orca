import { describe, expect, it } from 'vitest'
import type { TopLevelView } from './ui-chrome-types'
import { isTopLevelView } from './top-level-view'

const KNOWN_VIEWS: TopLevelView[] = [
  'terminal',
  'settings',
  'tasks',
  'activity',
  'automations',
  'space',
  'skills',
  'artifacts',
  'trivium',
  'mobile'
]

describe('isTopLevelView', () => {
  it('accepts every view the chrome can mount', () => {
    for (const view of KNOWN_VIEWS) {
      expect(isTopLevelView(view)).toBe(true)
    }
  })

  it('rejects unknown values and inherited object keys', () => {
    expect(isTopLevelView('trivium-page')).toBe(false)
    expect(isTopLevelView('constructor')).toBe(false)
    expect(isTopLevelView('__proto__')).toBe(false)
    expect(isTopLevelView(null)).toBe(false)
    expect(isTopLevelView(7)).toBe(false)
  })
})
