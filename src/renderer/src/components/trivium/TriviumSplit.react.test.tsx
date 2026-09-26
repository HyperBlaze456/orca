// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRIVIUM_SPLIT_STORAGE_KEY } from './trivium-page-split'
import { TriviumSplit } from './TriviumSplit'

// happy-dom lays nothing out: every element reports this page width.
const PAGE_WIDTH = 1000

function renderSplit(): { divider: HTMLElement; pane: HTMLElement } {
  render(<TriviumSplit start={<p>Structure</p>} end={<p>Reader</p>} />)
  const divider = screen.getByRole('separator', { name: 'Resize the structure pane' })
  const pane = document.getElementById(divider.getAttribute('aria-controls') ?? '')
  if (!pane) {
    throw new Error('The divider controls no pane')
  }
  return { divider, pane }
}

function stored(): string | null {
  return localStorage.getItem(TRIVIUM_SPLIT_STORAGE_KEY)
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(PAGE_WIDTH)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TriviumSplit', () => {
  it('starts at 440px and reports its range to assistive tech', () => {
    const { divider, pane } = renderSplit()
    expect(divider).toHaveAttribute('aria-orientation', 'vertical')
    expect(divider).toHaveAttribute('aria-valuenow', '440')
    expect(divider).toHaveAttribute('aria-valuemin', '320')
    expect(divider).toHaveAttribute('aria-valuemax', '600')
    expect(divider).toHaveAttribute('tabindex', '0')
    expect(pane.style.width).toBe('440px')
    expect(pane).toHaveTextContent('Structure')
    expect(stored()).toBeNull()
  })

  it('moves with the arrow keys, stops at 320px and 60%, and remembers the width', () => {
    const { divider, pane } = renderSplit()
    divider.focus()
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '456')
    expect(pane.style.width).toBe('456px')
    expect(stored()).toBe('456')

    for (let press = 0; press < 5; press += 1) {
      fireEvent.keyDown(divider, { key: 'ArrowRight', shiftKey: true })
    }
    expect(divider).toHaveAttribute('aria-valuenow', '600')
    expect(stored()).toBe('600')

    for (let press = 0; press < 10; press += 1) {
      fireEvent.keyDown(divider, { key: 'ArrowLeft', shiftKey: true })
    }
    expect(divider).toHaveAttribute('aria-valuenow', '320')
    expect(stored()).toBe('320')

    fireEvent.keyDown(divider, { key: 'ArrowUp' })
    expect(divider).toHaveAttribute('aria-valuenow', '320')
  })

  it('follows a drag within the bounds and saves where it ends', () => {
    const { divider, pane } = renderSplit()
    fireEvent.mouseDown(divider, { clientX: 440 })
    expect(divider).toHaveAttribute('data-resizing', 'true')
    fireEvent.mouseMove(window, { clientX: 520 })
    fireEvent.mouseUp(window)
    expect(divider).not.toHaveAttribute('data-resizing')
    expect(divider).toHaveAttribute('aria-valuenow', '520')
    expect(pane.style.width).toBe('520px')
    expect(stored()).toBe('520')

    fireEvent.mouseDown(divider, { clientX: 520 })
    fireEvent.mouseMove(window, { clientX: 1400 })
    fireEvent.mouseUp(window)
    expect(divider).toHaveAttribute('aria-valuenow', '600')

    fireEvent.mouseDown(divider, { clientX: 600 })
    fireEvent.mouseMove(window, { clientX: 0 })
    fireEvent.mouseUp(window)
    expect(divider).toHaveAttribute('aria-valuenow', '320')
    expect(stored()).toBe('320')
  })

  it('opens at the stored width, narrower on a narrow page without forgetting the choice', () => {
    localStorage.setItem(TRIVIUM_SPLIT_STORAGE_KEY, '520')
    const first = renderSplit()
    expect(first.divider).toHaveAttribute('aria-valuenow', '520')
    cleanup()

    localStorage.setItem(TRIVIUM_SPLIT_STORAGE_KEY, '900')
    const narrow = renderSplit()
    expect(narrow.divider).toHaveAttribute('aria-valuenow', '600')
    expect(narrow.pane.style.width).toBe('600px')
    expect(stored()).toBe('900')
  })
})
