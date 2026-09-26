import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { parseTriviumTextParagraphs, type TriviumTextSegment } from './trivium-rich-text'

/** Orca's inline-code treatment, sized relative to the surrounding text. */
export function TriviumInlineCode({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <code
      className={cn(
        'rounded bg-muted px-1 py-0.5 font-mono text-[0.88em] box-decoration-clone',
        className
      )}
    >
      {children}
    </code>
  )
}

function renderSegments(segments: TriviumTextSegment[]): ReactNode[] {
  return segments.map((segment) =>
    segment.code ? (
      <TriviumInlineCode key={segment.offset}>{segment.text}</TriviumInlineCode>
    ) : (
      <Fragment key={segment.offset}>{segment.text}</Fragment>
    )
  )
}

/**
 * Harness text as React nodes: blank lines split paragraphs, backtick spans become code.
 * `inline` renders one span (paragraphs joined by a space) for rows, pills and buttons.
 */
export function TriviumRichText({
  text,
  inline = false,
  className
}: {
  text: string
  inline?: boolean
  className?: string
}): React.JSX.Element | null {
  const paragraphs = parseTriviumTextParagraphs(text)
  if (paragraphs.length === 0) {
    return null
  }
  // Why: keep-all keeps Korean words whole; anywhere still breaks long identifiers.
  if (inline) {
    const firstOffset = paragraphs[0].offset
    return (
      <span className={cn('break-keep wrap-anywhere', className)}>
        {paragraphs.map((paragraph) => (
          <Fragment key={paragraph.offset}>
            {paragraph.offset === firstOffset ? null : ' '}
            {renderSegments(paragraph.segments)}
          </Fragment>
        ))}
      </span>
    )
  }
  return (
    <div className={cn('space-y-2.5 break-keep wrap-anywhere', className)}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph.offset}>{renderSegments(paragraph.segments)}</p>
      ))}
    </div>
  )
}
