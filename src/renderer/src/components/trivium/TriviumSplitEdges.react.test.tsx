// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRIVIUM_SPLIT_STORAGE_KEY } from './trivium-page-split'
import { TriviumSplit } from './TriviumSplit'

// happy-dom lays nothing out: every element reports this page width (60% = 600px).
const PAGE_WIDTH = 1000

type StorageStub = Storage & {
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>
}

/**
 * Why a stubbed global, not vi.spyOn(localStorage, …): happy-dom's Storage is a proxy and
 * vi.restoreAllMocks() does not undo a spy on it, so a throwing mock leaks into later tests.
 */
function stubStorage(items: Record<string, string>, refuse = false): StorageStub {
  const store = new Map(Object.entries(items))
  const stub: StorageStub = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    getItem: vi.fn((key: string) => {
      if (refuse) {
        throw new Error('SecurityError: storage is disabled')
      }
      return store.get(key) ?? null
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (refuse) {
        throw new Error('QuotaExceededError')
      }
      store.set(key, value)
    })
  }
  vi.stubGlobal('localStorage', stub)
  return stub
}

function renderSplit(): { divider: HTMLElement; pane: HTMLElement } {
  render(<TriviumSplit start={<p>Structure</p>} end={<p>Reader</p>} />)
  const divider = screen.getByRole('separator', { name: 'Resize the structure pane' })
  const pane = document.getElementById(divider.getAttribute('aria-controls') ?? '')
  if (!pane) {
    throw new Error('The divider controls no pane')
  }
  return { divider, pane }
}

function drag(divider: HTMLElement, from: number, to: number): void {
  fireEvent.mouseDown(divider, { clientX: from })
  fireEvent.mouseMove(window, { clientX: to })
  fireEvent.mouseUp(window)
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(PAGE_WIDTH)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TriviumSplit when storage refuses', () => {
  it('opens at 440px and still resizes by keyboard and drag when localStorage throws', () => {
    // A readable store would open at 520px; the throwing one must fall back to the default.
    const storage = stubStorage({ [TRIVIUM_SPLIT_STORAGE_KEY]: '520' }, true)
    const { divider, pane } = renderSplit()
    expect(storage.getItem).toHaveBeenCalledWith(TRIVIUM_SPLIT_STORAGE_KEY)
    expect(divider).toHaveAttribute('aria-valuenow', '440')
    expect(pane.style.width).toBe('440px')

    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '456')
    expect(pane.style.width).toBe('456px')

    drag(divider, 456, 356)
    expect(divider).toHaveAttribute('aria-valuenow', '356')
    expect(pane.style.width).toBe('356px')
    // It tried to remember each width; the refusals were swallowed.
    expect(storage.setItem).toHaveBeenCalledWith(TRIVIUM_SPLIT_STORAGE_KEY, '356')
  })
})

describe('TriviumSplit stored widths out of range', () => {
  it('opens a stored width below the minimum at 320px', () => {
    stubStorage({ [TRIVIUM_SPLIT_STORAGE_KEY]: '100' })
    const { divider, pane } = renderSplit()
    expect(divider).toHaveAttribute('aria-valuenow', '320')
    expect(pane.style.width).toBe('320px')
  })

  it('opens an unreadable stored width at the 440px default', () => {
    stubStorage({ [TRIVIUM_SPLIT_STORAGE_KEY]: 'not json' })
    const { divider } = renderSplit()
    expect(divider).toHaveAttribute('aria-valuenow', '440')
  })

  it('arrows from the clamped width the user sees, not the wider stored one', () => {
    const storage = stubStorage({ [TRIVIUM_SPLIT_STORAGE_KEY]: '900' })
    const { divider, pane } = renderSplit()
    expect(divider).toHaveAttribute('aria-valuenow', '600')
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    expect(divider).toHaveAttribute('aria-valuenow', '584')
    expect(pane.style.width).toBe('584px')
    expect(storage.getItem(TRIVIUM_SPLIT_STORAGE_KEY)).toBe('584')
  })

  it('drags from the clamped width the user sees, not the wider stored one', () => {
    const storage = stubStorage({ [TRIVIUM_SPLIT_STORAGE_KEY]: '900' })
    const { divider, pane } = renderSplit()
    drag(divider, 600, 500)
    expect(divider).toHaveAttribute('aria-valuenow', '500')
    expect(pane.style.width).toBe('500px')
    expect(storage.getItem(TRIVIUM_SPLIT_STORAGE_KEY)).toBe('500')
  })

  it('does not rewrite storage for a key press that cannot move the divider', () => {
    const storage = stubStorage({ [TRIVIUM_SPLIT_STORAGE_KEY]: '320' })
    const { divider } = renderSplit()
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    fireEvent.keyDown(divider, { key: 'Home' })
    expect(divider).toHaveAttribute('aria-valuenow', '320')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
