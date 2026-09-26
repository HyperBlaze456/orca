// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TriviumRichText } from './TriviumRichText'

afterEach(cleanup)

function codeTexts(root: HTMLElement): (string | null)[] {
  return [...root.querySelectorAll('code')].map((code) => code.textContent)
}

describe('TriviumRichText', () => {
  it('renders backtick spans as code with the inline-code treatment', () => {
    const { container } = render(
      <TriviumRichText text="Run `pnpm test` before `trivium.status.tickets`." />
    )
    expect(codeTexts(container)).toEqual(['pnpm test', 'trivium.status.tickets'])
    const code = container.querySelector('code')
    expect(code?.className).toContain('font-mono')
    expect(code?.className).toContain('bg-muted')
    expect(container.textContent).toBe('Run pnpm test before trivium.status.tickets.')
  })

  it('leaves unmatched and empty backticks literal', () => {
    for (const text of ['A stray ` tick stays literal', 'An empty `` pair too']) {
      const { container } = render(<TriviumRichText text={text} />)
      expect(container.querySelector('code')).toBeNull()
      expect(container.textContent).toBe(text)
      cleanup()
    }

    const odd = render(<TriviumRichText text="`ok` but ` stays" />).container
    expect(codeTexts(odd)).toEqual(['ok'])
    expect(odd.textContent).toBe('ok but ` stays')
  })

  it('splits paragraphs on blank lines and keeps single line breaks inside one', () => {
    const { container } = render(
      <TriviumRichText text={'First line\nstill first\n\nSecond\n  \n\n\nThird `x`'} />
    )
    const paragraphs = [...container.querySelectorAll('p')]
    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      'First line\nstill first',
      'Second',
      'Third x'
    ])
    expect(codeTexts(container)).toEqual(['x'])
  })

  it('keeps inline text in one element', () => {
    const { container } = render(
      <TriviumRichText inline text={'First\n\nSecond with `code`'} className="text-[13px]" />
    )
    expect(container.childNodes).toHaveLength(1)
    const root = container.firstElementChild
    expect(root?.tagName).toBe('SPAN')
    expect(root?.className).toContain('text-[13px]')
    expect(container.querySelector('p')).toBeNull()
    expect(container.textContent).toBe('First Second with code')
    expect(codeTexts(container)).toEqual(['code'])
  })

  it('passes Korean text through unchanged and breaks lines by word', () => {
    const korean = '목표 달성 여부를 판단할 기준이 아직 기록되지 않았습니다.'
    const { container } = render(<TriviumRichText text={korean} />)
    expect(container.textContent).toBe(korean)
    const root = container.firstElementChild
    expect(root?.className).toContain('break-keep')
    expect(root?.className).toContain('wrap-anywhere')
    cleanup()

    const mixed = render(<TriviumRichText inline text="`trivium` 하네스가 목표를 추적한다" />)
    expect(codeTexts(mixed.container)).toEqual(['trivium'])
    expect(mixed.container.textContent).toBe('trivium 하네스가 목표를 추적한다')
  })

  it('renders markup in the input as text, never as HTML', () => {
    const text = '<b>bold</b> & <img src=x onerror="alert(1)"> `<script>x</script>`'
    const { container } = render(<TriviumRichText text={text} />)
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(codeTexts(container)).toEqual(['<script>x</script>'])
    expect(container.textContent).toBe(
      '<b>bold</b> & <img src=x onerror="alert(1)"> <script>x</script>'
    )
  })

  it('renders nothing for blank text', () => {
    expect(render(<TriviumRichText text={' \n\n '} />).container.childNodes).toHaveLength(0)
    expect(render(<TriviumRichText inline text="" />).container.childNodes).toHaveLength(0)
  })
})

describe('TriviumRichText: contract edges', () => {
  it('splits CRLF blank lines into paragraphs and applies className to the block root', () => {
    const { container } = render(
      <TriviumRichText text={'One `a`\r\n\r\nTwo'} className="max-w-[70ch]" />
    )
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['One a', 'Two'])
    const root = container.firstElementChild
    expect(root?.tagName).toBe('DIV')
    expect(root?.className).toContain('max-w-[70ch]')
  })

  it('renders code spans at both edges and back to back', () => {
    const { container } = render(<TriviumRichText text="`a` mid `b``c`" />)
    expect(codeTexts(container)).toEqual(['a', 'b', 'c'])
    expect(container.textContent).toBe('a mid bc')
  })

  it('passes decomposed Korean, entities and link syntax through as literal text', () => {
    const text = `${'한국어 목표'.normalize('NFD')} &lt;b&gt; &amp; [x](javascript:alert(1))`
    const { container } = render(<TriviumRichText text={text} />)
    expect(container.textContent).toBe(text)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('renders repeated segments without React key warnings', () => {
    const errors: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args)
    }
    try {
      render(<TriviumRichText text={'`a` `a` `a`\n\n`a` `a`\n\n`a`'} />)
      cleanup()
      render(<TriviumRichText inline text={'`a` `a`\n\n`a` `a`'} />)
    } finally {
      console.error = original
    }
    expect(errors).toEqual([])
  })

  it('keeps inline to one element when every paragraph is code', () => {
    const { container } = render(<TriviumRichText inline text={'`a`\n\n`b`'} />)
    expect(container.childNodes).toHaveLength(1)
    expect(container.firstElementChild?.tagName).toBe('SPAN')
    expect(codeTexts(container)).toEqual(['a', 'b'])
    expect(container.textContent).toBe('a b')
  })
})
