// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadTriviumTicketListOptions,
  readTriviumTicketListOptions,
  saveTriviumTicketListOptions,
  TRIVIUM_TICKET_LIST_DEFAULTS,
  TRIVIUM_TICKET_LIST_STORAGE_KEY
} from './trivium-ticket-list-options'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('ticket list display options', () => {
  it('starts grouped by status in goal order with ID hidden and done tickets shown', () => {
    expect(loadTriviumTicketListOptions()).toEqual({
      grouping: 'status',
      ordering: 'goal',
      properties: { id: false, goal: true, commit: true },
      showDone: true
    })
  })

  it('round-trips through storage', () => {
    const options = {
      grouping: 'goal',
      ordering: 'title',
      properties: { id: true, goal: false, commit: true },
      showDone: false
    } as const
    saveTriviumTicketListOptions(options)
    expect(JSON.parse(localStorage.getItem(TRIVIUM_TICKET_LIST_STORAGE_KEY) ?? 'null')).toEqual(
      options
    )
    expect(loadTriviumTicketListOptions()).toEqual(options)
  })

  it('keeps the default for every field that is missing or unreadable', () => {
    expect(readTriviumTicketListOptions(null)).toEqual(TRIVIUM_TICKET_LIST_DEFAULTS)
    expect(readTriviumTicketListOptions([1, 2])).toEqual(TRIVIUM_TICKET_LIST_DEFAULTS)
    expect(
      readTriviumTicketListOptions({
        grouping: 'none',
        ordering: 7,
        properties: { id: 'yes', commit: false },
        showDone: false
      })
    ).toEqual({
      grouping: 'none',
      ordering: 'goal',
      properties: { id: false, goal: true, commit: false },
      showDone: false
    })
  })

  it('works without storage', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(loadTriviumTicketListOptions()).toEqual(TRIVIUM_TICKET_LIST_DEFAULTS)
    expect(() => saveTriviumTicketListOptions(TRIVIUM_TICKET_LIST_DEFAULTS)).not.toThrow()
  })
})
