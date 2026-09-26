// Harness text is plain text whose only markup is Markdown-style `code` spans; nothing becomes HTML.

export type TriviumTextSegment = {
  /** Offset in the source text; unique within one parse, so it doubles as a React key. */
  offset: number
  code: boolean
  text: string
}

export type TriviumTextParagraph = {
  offset: number
  segments: TriviumTextSegment[]
}

// A blank line is any run of whitespace that contains two line breaks.
const PARAGRAPH_BREAK = /\n\s*\n/g
// An unmatched or empty pair of backticks is not a span and stays literal.
const CODE_SPAN = /`([^`]+)`/g

export function parseTriviumTextSegments(text: string, offset = 0): TriviumTextSegment[] {
  const segments: TriviumTextSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(CODE_SPAN)) {
    if (match.index > cursor) {
      segments.push({
        offset: offset + cursor,
        code: false,
        text: text.slice(cursor, match.index)
      })
    }
    segments.push({ offset: offset + match.index, code: true, text: match[1] })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) {
    segments.push({ offset: offset + cursor, code: false, text: text.slice(cursor) })
  }
  return segments
}

/** Paragraphs split on blank lines, trimmed; empty paragraphs are dropped. */
export function parseTriviumTextParagraphs(text: string): TriviumTextParagraph[] {
  const paragraphs: TriviumTextParagraph[] = []
  const pushParagraph = (start: number, end: number): void => {
    const raw = text.slice(start, end)
    const body = raw.trim()
    if (!body) {
      return
    }
    const offset = start + raw.length - raw.trimStart().length
    paragraphs.push({ offset, segments: parseTriviumTextSegments(body, offset) })
  }
  let start = 0
  for (const separator of text.matchAll(PARAGRAPH_BREAK)) {
    pushParagraph(start, separator.index)
    start = separator.index + separator[0].length
  }
  pushParagraph(start, text.length)
  return paragraphs
}
