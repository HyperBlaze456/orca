// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TriviumChangeDot, triviumChangeDotLabel } from './TriviumChangeDot'

afterEach(cleanup)

function renderDot(dot: ReactElement): void {
  render(<TooltipProvider>{dot}</TooltipProvider>)
}

describe('TriviumChangeDot', () => {
  it('marks a new item with a filled blue dot named in its tooltip', async () => {
    renderDot(<TriviumChangeDot kind="new" />)
    const dot = screen.getByRole('img', { name: 'New since your last visit' })
    expect(dot).toHaveClass('size-1.75', 'rounded-full', 'bg-trivium-new')
    expect(dot).not.toHaveClass('border-trivium-new')
    expect(dot).toHaveAttribute('data-trivium-change', 'new')

    fireEvent.focus(dot)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('New since your last visit')
  })

  it('marks a changed item with a blue ring that names the change', async () => {
    renderDot(<TriviumChangeDot kind="changed" description="Tier G2 → G3" />)
    const dot = screen.getByRole('img', { name: 'Changed: Tier G2 → G3' })
    expect(dot).toHaveClass('size-1.75', 'rounded-full', 'border-[1.5px]', 'border-trivium-new')
    expect(dot).not.toHaveClass('bg-trivium-new')

    fireEvent.focus(dot)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Changed: Tier G2 → G3')
  })

  it('names a change without a description generically', () => {
    renderDot(<TriviumChangeDot kind="changed" description="  " />)
    expect(screen.getByRole('img', { name: 'Changed since your last visit' })).toBeInTheDocument()
    expect(triviumChangeDotLabel('changed')).toBe('Changed since your last visit')
    expect(triviumChangeDotLabel('new', 'ignored')).toBe('New since your last visit')
  })
})

describe('TriviumChangeDot: contract edges', () => {
  it('keeps a description with markup, quotes and i18n syntax verbatim in its name and tooltip', async () => {
    const description = `Title 'A/B' → "C & D" <b>x</b> {{count}} $t(trivium.changeDot.new)`
    renderDot(<TriviumChangeDot kind="changed" description={description} />)
    const dot = screen.getByRole('img', { name: `Changed: ${description}` })
    expect(document.querySelector('b')).toBeNull()

    fireEvent.focus(dot)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(`Changed: ${description}`)
    expect(document.querySelector('b')).toBeNull()
    expect(triviumChangeDotLabel('changed', description)).toBe(`Changed: ${description}`)
  })

  it('names itself in the tooltip on mouse hover, the only way to reach it since it is not focusable', async () => {
    renderDot(<TriviumChangeDot kind="changed" description="Status adopted → retired" />)
    const dot = screen.getByRole('img', { name: 'Changed: Status adopted → retired' })
    expect(dot).not.toHaveAttribute('tabindex')

    fireEvent.pointerMove(dot, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Changed: Status adopted → retired'
    )
  })

  it('stays an empty 7px round marker when merged with a className', () => {
    renderDot(<TriviumChangeDot kind="new" description="ignored" className="ml-1" />)
    const dot = screen.getByRole('img', { name: 'New since your last visit' })
    expect(dot).toHaveClass('size-1.75', 'rounded-full', 'bg-trivium-new', 'ml-1')
    expect(dot).toBeEmptyDOMElement()
    expect(dot.tagName).toBe('SPAN')
  })
})
