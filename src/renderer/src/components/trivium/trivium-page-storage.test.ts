// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readTriviumPageStorage,
  triviumPageStorageKey,
  writeTriviumPageStorage
} from './trivium-page-storage'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Trivium page storage', () => {
  it('keys by workspace and harness root', () => {
    expect(triviumPageStorageKey('repo:1', '/srv/notes')).toBe(
      'orca-trivium-page-v1:repo:1:/srv/notes'
    )
    expect(triviumPageStorageKey('folder:2', null)).toBe('orca-trivium-page-v1:folder:2:')
  })

  it('round-trips JSON and reads garbage as nothing', () => {
    writeTriviumPageStorage('key', { a: [1, 'b'] })
    expect(readTriviumPageStorage('key')).toEqual({ a: [1, 'b'] })
    expect(readTriviumPageStorage('missing')).toBeNull()
    localStorage.setItem('broken', '{not json')
    expect(readTriviumPageStorage('broken')).toBeNull()
  })

  it('degrades to no storage when the browser refuses it', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(readTriviumPageStorage('key')).toBeNull()
    expect(() => writeTriviumPageStorage('key', 1)).not.toThrow()
  })
})
