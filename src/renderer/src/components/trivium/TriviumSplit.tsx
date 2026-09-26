import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  clampTriviumSplitWidth,
  readTriviumSplitWidth,
  triviumSplitBounds,
  triviumSplitKeyWidth,
  writeTriviumSplitWidth
} from './trivium-page-split'

/**
 * The page body: the structure pane at a width the user drags or arrows (320px to 60% of the
 * page, kept across visits), a divider that is also the pane's border, and the reader.
 */
export function TriviumSplit({
  start,
  end
}: {
  start: ReactNode
  end: ReactNode
}): React.JSX.Element {
  const [storedWidth, setStoredWidth] = useState(readTriviumSplitWidth)
  const [pageWidth, setPageWidth] = useState(0)
  const pageRef = useRef<HTMLDivElement>(null)
  const paneId = useId()
  const bounds = triviumSplitBounds(pageWidth)
  // Why render-only: a window narrowed for a moment must not shrink the width the user chose.
  const width = clampTriviumSplitWidth(storedWidth, bounds)
  const saveWidth = useCallback((next: number) => {
    setStoredWidth(next)
    writeTriviumSplitWidth(next)
  }, [])
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width,
    minWidth: bounds.min,
    maxWidth: bounds.max,
    deltaSign: 1,
    setWidth: saveWidth
  })

  useEffect(() => {
    const page = pageRef.current
    if (!page) {
      return
    }
    const measure = (): void => setPageWidth(page.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(page)
    return () => observer.disconnect()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const next = triviumSplitKeyWidth(event.key, event.shiftKey, width, bounds)
    if (next === null) {
      return
    }
    event.preventDefault()
    if (next !== width) {
      saveWidth(next)
    }
  }

  return (
    <div ref={pageRef} className="flex min-h-0 min-w-0 flex-1">
      <div ref={containerRef} id={paneId} className="flex min-h-0 shrink-0 flex-col">
        {start}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-controls={paneId}
        aria-label={translate('trivium.split.resize', 'Resize the structure pane')}
        aria-valuemin={bounds.min}
        aria-valuemax={Number.isFinite(bounds.max) ? bounds.max : undefined}
        aria-valuenow={width}
        data-trivium-split=""
        data-resizing={isResizing ? 'true' : undefined}
        onMouseDown={onResizeStart}
        onKeyDown={onKeyDown}
        className="group relative z-10 -mx-[3px] flex w-[7px] shrink-0 cursor-col-resize justify-center outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            'w-px transition-colors motion-reduce:transition-none',
            isResizing
              ? 'bg-ring'
              : 'bg-border group-hover:bg-ring/60 group-focus-visible:w-0.5 group-focus-visible:bg-ring'
          )}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{end}</div>
    </div>
  )
}
