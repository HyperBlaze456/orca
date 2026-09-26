import { describe, expect, it } from 'vitest'
import {
  readPayloadCount,
  readPayloadCounts,
  readPayloadOptionalText,
  readPayloadRecords,
  readPayloadStrings,
  readPayloadText
} from './trivium-payload-fields'

describe('Trivium payload field readers', () => {
  it('read a mistyped field as empty instead of failing', () => {
    expect(readPayloadText(3)).toBe('')
    expect(readPayloadOptionalText('')).toBeNull()
    expect(readPayloadOptionalText('ticket.a')).toBe('ticket.a')
    expect(readPayloadCount(Number.NaN)).toBe(0)
    expect(readPayloadCount(4)).toBe(4)
    expect(readPayloadStrings(['a', 1, null, 'b'])).toEqual(['a', 'b'])
    expect(readPayloadStrings('a')).toEqual([])
    expect(readPayloadRecords([{ a: 1 }, [], null, 'x'])).toEqual([{ a: 1 }])
    expect(readPayloadCounts({ valid: 3, label: 'x' })).toEqual({ valid: 3 })
    expect(readPayloadCounts([1])).toEqual({})
  })
})
