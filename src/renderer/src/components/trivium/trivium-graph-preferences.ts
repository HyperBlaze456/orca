import { useState } from 'react'
import type { TriviumGraphFilter, TriviumGraphTextSize } from './trivium-goal-graph'

const STORAGE_KEY = 'orca-trivium-graph-preferences-v1'
type GraphPreferences = { filter: TriviumGraphFilter; textSize: TriviumGraphTextSize }
const DEFAULTS: GraphPreferences = { filter: 'not-rejected', textSize: 'standard' }

export function isTriviumGraphFilter(value: unknown): value is TriviumGraphFilter {
  return (
    value === 'not-rejected' ||
    value === 'all' ||
    value === 'adopted' ||
    value === 'anticipated' ||
    value === 'candidate' ||
    value === 'rejected'
  )
}

function readPreferences(): GraphPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!value || typeof value !== 'object') {
      return DEFAULTS
    }
    return {
      filter:
        'filter' in value && isTriviumGraphFilter(value.filter) ? value.filter : DEFAULTS.filter,
      textSize: 'textSize' in value && value.textSize === 'large' ? 'large' : 'standard'
    }
  } catch {
    return DEFAULTS
  }
}

export function useTriviumGraphPreferences(): readonly [
  GraphPreferences,
  (patch: Partial<GraphPreferences>) => void
] {
  const [preferences, setPreferences] = useState(readPreferences)
  const update = (patch: Partial<GraphPreferences>): void => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // View controls still work when storage is unavailable.
    }
  }
  return [preferences, update] as const
}
