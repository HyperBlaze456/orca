import { isTriviumRecord } from './trivium-workspace-query'

// Lenient readers for fields of a trivium projection: a missing or mistyped field reads as
// empty instead of failing the whole payload, because installed and HEAD binaries differ.

export function readPayloadText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readPayloadOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export function readPayloadCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function readPayloadStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function readPayloadRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isTriviumRecord) : []
}

export function readPayloadCounts(value: unknown): Record<string, number> {
  if (!isTriviumRecord(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
  )
}
