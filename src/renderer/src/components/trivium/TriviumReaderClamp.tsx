import { useLayoutEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { TriviumReaderQuietButton } from './TriviumReaderButtons'
import { TriviumRichText } from './TriviumRichText'

// Tailwind only generates classes it can read, so each clamp is spelled out.
const CLAMP = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' } as const
type ClampLines = keyof typeof CLAMP

// Why: a hidden page (or a test DOM) has no layout, so fall back to a length estimate.
const CHARACTERS_PER_LINE = 70

function likelyOverflows(text: string, lines: number): boolean {
  return text.length > lines * CHARACTERS_PER_LINE || text.split(/\n\s*\n/).length > lines
}

/** Harness prose clamped to a few lines with "Show more" when it does not fit. */
export function TriviumReaderClampedText({
  text,
  lines,
  className,
  textClassName
}: {
  text: string
  lines: ClampLines
  className?: string
  textClassName?: string
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [measured, setMeasured] = useState<boolean | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const body = frame.current?.firstElementChild
    if (!body || open) {
      return
    }
    const measure = (): void => {
      if (body.clientHeight > 0) {
        setMeasured(body.scrollHeight > body.clientHeight + 1)
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [text, open])

  if (!text.trim()) {
    return null
  }
  const overflows = measured ?? likelyOverflows(text, lines)
  return (
    <div className={className}>
      <div ref={frame}>
        <TriviumRichText text={text} className={cn(textClassName, !open && CLAMP[lines])} />
      </div>
      {open || overflows ? (
        <TriviumReaderQuietButton
          className="mt-1 -ml-2"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open
            ? translate('trivium.reader.showLess', 'Show less')
            : translate('trivium.reader.showMore', 'Show more')}
        </TriviumReaderQuietButton>
      ) : null}
    </div>
  )
}

/** Short harness text clamped to a few lines; the text itself toggles the full version. */
export function TriviumReaderExpandableText({
  text,
  lines,
  className
}: {
  text: string
  lines: ClampLines
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className={cn(
        'block w-full min-w-0 cursor-pointer rounded-sm text-left focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        className
      )}
    >
      <TriviumRichText inline text={text} className={cn('block', !open && CLAMP[lines])} />
    </button>
  )
}
