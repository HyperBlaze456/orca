import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const COPIED_FEEDBACK_MS = 1500

/**
 * A low-emphasis text action ("Show more", "Open in list"): a ghost button that reads muted
 * and turns to the accent foreground on hover. The wrapper carries layout classes.
 */
export function TriviumReaderQuietButton({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant' | 'size'>): React.JSX.Element {
  return (
    <span className={cn('inline-flex text-muted-foreground', className)}>
      <Button variant="ghost" size="xs" {...props}>
        {children}
      </Button>
    </span>
  )
}

/** Copies `text`; the icon turns into a check for a moment instead of a toast. */
export function TriviumReaderCopyButton({
  text,
  label,
  className
}: {
  text: string
  label: string
  className?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current)
      }
    },
    []
  )

  const copy = useCallback(async () => {
    try {
      await window.api.ui.writeClipboardText(text)
    } catch {
      // Clipboard writes can be refused while the window is unfocused; nothing was copied.
      return
    }
    setCopied(true)
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current)
    }
    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null
      setCopied(false)
    }, COPIED_FEEDBACK_MS)
  }, [text])

  return (
    <span className={cn('inline-flex items-center', className)}>
      <TriviumReaderQuietButton onClick={() => void copy()} data-trivium-copy={text}>
        {copied ? (
          <Check aria-hidden="true" className="size-3 text-trivium-success" />
        ) : (
          <Copy aria-hidden="true" className="size-3" />
        )}
        {label}
      </TriviumReaderQuietButton>
      <span role="status" className="sr-only">
        {copied ? translate('trivium.reader.copied', 'Copied') : ''}
      </span>
    </span>
  )
}
