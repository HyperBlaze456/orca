import { describe, expect, it } from 'vitest'
import { parseTriviumTextParagraphs, parseTriviumTextSegments } from './trivium-rich-text'

describe('parseTriviumTextSegments', () => {
  it('splits text and code spans with their source offsets', () => {
    expect(parseTriviumTextSegments('a `b` c')).toEqual([
      { offset: 0, code: false, text: 'a ' },
      { offset: 2, code: true, text: 'b' },
      { offset: 5, code: false, text: ' c' }
    ])
    expect(parseTriviumTextSegments('`a``b`', 10)).toEqual([
      { offset: 10, code: true, text: 'a' },
      { offset: 13, code: true, text: 'b' }
    ])
  })

  it('keeps unmatched and empty backticks as text', () => {
    expect(parseTriviumTextSegments('a `` b')).toEqual([{ offset: 0, code: false, text: 'a `` b' }])
    expect(parseTriviumTextSegments('`x` and `y')).toEqual([
      { offset: 0, code: true, text: 'x' },
      { offset: 3, code: false, text: ' and `y' }
    ])
    expect(parseTriviumTextSegments('')).toEqual([])
  })
})

describe('parseTriviumTextParagraphs', () => {
  const texts = (text: string): string[] =>
    parseTriviumTextParagraphs(text).map((paragraph) =>
      paragraph.segments.map((segment) => segment.text).join('')
    )

  it('splits on blank lines, including CRLF and whitespace-only lines', () => {
    const paragraphs = parseTriviumTextParagraphs('One\r\n\r\nTwo\n\t\n\nThree')
    expect(paragraphs.map((paragraph) => paragraph.offset)).toEqual([0, 7, 14])
    expect(texts('One\r\n\r\nTwo\n\t\n\nThree')).toEqual(['One', 'Two', 'Three'])
  })

  it('keeps single line breaks and drops leading or trailing blank lines', () => {
    expect(texts('a\nb')).toEqual(['a\nb'])
    expect(parseTriviumTextParagraphs('\n\n  Only\n\n')).toEqual([
      { offset: 4, segments: [{ offset: 4, code: false, text: 'Only' }] }
    ])
    expect(parseTriviumTextParagraphs(' \n \n ')).toEqual([])
  })

  it('never lets a code span cross a paragraph break', () => {
    // As one run the two backticks would pair into a code span across the blank line.
    expect(parseTriviumTextParagraphs('a `b\n\nc` d')).toEqual([
      { offset: 0, segments: [{ offset: 0, code: false, text: 'a `b' }] },
      { offset: 6, segments: [{ offset: 6, code: false, text: 'c` d' }] }
    ])
  })
})
