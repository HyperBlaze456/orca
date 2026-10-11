import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, SquareTerminal } from 'lucide-react'
import TerminalPane from '@/components/terminal-pane/TerminalPane'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  pasteIntoTriviumTerminalWhenReady,
  type TriviumTerminalInsertOutcome
} from './trivium-terminal-command-insert'
import {
  clampTriviumTerminalHeight,
  readTriviumTerminalHeight,
  triviumTerminalDragHeight,
  triviumTerminalHeightBounds,
  triviumTerminalKeyHeight,
  writeTriviumTerminalHeight
} from './trivium-terminal-panel-height'
import {
  triviumTerminalWorktreeId,
  type TriviumTerminalPasteRequest
} from './trivium-terminal-panel-state'

type PasteSettled = (
  request: TriviumTerminalPasteRequest,
  outcome: TriviumTerminalInsertOutcome
) => void

type TriviumTerminalDrag = {
  startY: number
  startHeight: number
  draft: number
  bodyCursor: string
  bodyUserSelect: string
}

/**
 * One shell: its tab is created on mount and closed on unmount, like the onboarding inline
 * terminal. The branded id keeps it out of every workspace's tab strip.
 */
function TriviumTerminalShell({
  cwd,
  visible,
  pasteRequest,
  onPasteSettled,
  onRestart
}: {
  cwd: string
  visible: boolean
  pasteRequest: TriviumTerminalPasteRequest | null
  onPasteSettled: PasteSettled
  onRestart: () => void
}): React.JSX.Element | null {
  const createTab = useAppStore((state) => state.createTab)
  const closeTab = useAppStore((state) => state.closeTab)
  const setActiveTabForWorktree = useAppStore((state) => state.setActiveTabForWorktree)
  const setTabCustomTitle = useAppStore((state) => state.setTabCustomTitle)
  const [tabId, setTabId] = useState<string | null>(null)
  const [exited, setExited] = useState(false)
  const closedRef = useRef(false)
  const worktreeId = triviumTerminalWorktreeId(cwd)

  useEffect(() => {
    const tab = createTab(worktreeId, undefined, undefined, {
      activate: false,
      recordInteraction: false,
      forceHostRuntime: true
    })
    setActiveTabForWorktree(worktreeId, tab.id)
    setTabCustomTitle(tab.id, translate('trivium.terminal.tabTitle', 'Trivium terminal'), {
      recordInteraction: false
    })
    closedRef.current = false
    setTabId(tab.id)
    return () => {
      // Why: leaving the page or the workspace must not leave a shell running unseen.
      if (!closedRef.current) {
        closeTab(tab.id, { recordInteraction: false, reason: 'cleanup' })
      }
    }
  }, [closeTab, createTab, setActiveTabForWorktree, setTabCustomTitle, worktreeId])

  const end = (reason: 'pty-exit' | 'cleanup'): void => {
    if (!tabId || closedRef.current) {
      return
    }
    closedRef.current = true
    setExited(true)
    closeTab(tabId, { recordInteraction: false, reason })
  }

  useEffect(() => {
    if (!pasteRequest || !tabId) {
      return undefined
    }
    if (exited) {
      // A paste after `exit` starts a fresh shell; the next shell takes the request.
      onRestart()
      return undefined
    }
    return pasteIntoTriviumTerminalWhenReady(tabId, pasteRequest.text, (outcome) =>
      onPasteSettled(pasteRequest, outcome)
    )
  }, [exited, onPasteSettled, onRestart, pasteRequest, tabId])

  if (exited) {
    return (
      <div
        data-trivium-terminal-exited=""
        className="flex h-full items-center justify-center gap-2.5 text-xs text-muted-foreground"
      >
        <span role="status">{translate('trivium.terminal.exited', 'The shell exited.')}</span>
        <Button variant="outline" size="xs" onClick={onRestart}>
          {translate('trivium.terminal.restart', 'Start a new shell')}
        </Button>
      </div>
    )
  }
  if (!tabId) {
    return null
  }
  return (
    <TerminalPane
      tabId={tabId}
      worktreeId={worktreeId}
      cwd={cwd}
      isActive
      isVisible={visible}
      showSplitButton={false}
      onPtyExit={() => end('pty-exit')}
      onCloseTab={() => end('cleanup')}
    />
  )
}

/**
 * The page's bottom panel: a hairline separator to drag or arrow (120px to 70% of the space
 * below the header, kept across visits), a 32px header, and one plain shell at `cwd`. Hiding
 * keeps the shell running; the page unmounts the panel to end it.
 */
export function TriviumTerminalPanel({
  cwd,
  open,
  onHide,
  pasteRequest,
  onPasteSettled
}: {
  cwd: string
  open: boolean
  onHide: () => void
  pasteRequest: TriviumTerminalPasteRequest | null
  onPasteSettled: PasteSettled
}): React.JSX.Element {
  const [generation, setGeneration] = useState(0)
  const restart = useCallback(() => setGeneration((value) => value + 1), [])
  const [storedHeight, setStoredHeight] = useState(readTriviumTerminalHeight)
  const [regionHeight, setRegionHeight] = useState(0)
  const [resizing, setResizing] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const dragRef = useRef<TriviumTerminalDrag | null>(null)
  const panelId = useId()
  const bounds = triviumTerminalHeightBounds(regionHeight)
  // Why render-only: a window shortened for a moment must not shrink the height the user chose.
  const height = clampTriviumTerminalHeight(storedHeight, bounds)
  const title = translate('trivium.terminal.title', 'Terminal')
  const hideLabel = translate('trivium.terminal.hide', 'Hide terminal')

  useEffect(() => {
    const region = panelRef.current?.parentElement
    if (!region) {
      return undefined
    }
    const measure = (): void => setRegionHeight(region.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(region)
    return () => observer.disconnect()
  }, [])

  const saveHeight = useCallback((next: number) => {
    setStoredHeight(next)
    writeTriviumTerminalHeight(next)
  }, [])

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    dragRef.current = null
    document.body.style.cursor = drag.bodyCursor
    document.body.style.userSelect = drag.bodyUserSelect
    setResizing(false)
    if (drag.draft !== drag.startHeight) {
      saveHeight(drag.draft)
    }
  }, [saveHeight])

  useEffect(() => endDrag, [endDrag])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    dragRef.current = {
      startY: event.clientY,
      startHeight: height,
      draft: height,
      bodyCursor: document.body.style.cursor,
      bodyUserSelect: document.body.style.userSelect
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizing(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    drag.draft = triviumTerminalDragHeight(drag.startHeight, drag.startY, event.clientY, bounds)
    // Why the DOM write: re-rendering the terminal on every pointer move would stutter.
    if (panelRef.current) {
      panelRef.current.style.height = `${drag.draft}px`
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const next = triviumTerminalKeyHeight(event.key, event.shiftKey, height, bounds)
    if (next === null) {
      return
    }
    event.preventDefault()
    if (next !== height) {
      saveHeight(next)
    }
  }

  return (
    <section
      ref={panelRef}
      id={panelId}
      aria-label={title}
      data-trivium-terminal-panel=""
      className={cn('flex shrink-0 flex-col', !open && 'hidden')}
      style={{ height }}
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-controls={panelId}
        aria-label={translate('trivium.terminal.resize', 'Resize the terminal')}
        aria-valuemin={bounds.min}
        aria-valuemax={Number.isFinite(bounds.max) ? bounds.max : undefined}
        aria-valuenow={height}
        data-trivium-terminal-split=""
        data-resizing={resizing ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        className="group relative z-10 -my-[3px] flex h-[7px] shrink-0 cursor-row-resize flex-col justify-center outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-px transition-colors motion-reduce:transition-none',
            resizing
              ? 'bg-ring'
              : 'bg-border group-hover:bg-ring/60 group-focus-visible:h-0.5 group-focus-visible:bg-ring'
          )}
        />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-2 pr-2.5 pl-5">
        <SquareTerminal aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <h2 className="shrink-0 text-[13px] font-semibold">{title}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Why rtl: an overflowing path keeps its end (the folder) and loses its start. */}
            <span
              data-trivium-terminal-cwd=""
              className="min-w-0 truncate font-mono text-xs text-muted-foreground [direction:rtl]"
            >
              <bdi>{cwd}</bdi>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {cwd}
          </TooltipContent>
        </Tooltip>
        <div className="ml-auto flex shrink-0 items-center text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={hideLabel} onClick={onHide}>
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {hideLabel}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Why: the pane is absolute inset-0; this inset lines its text up with the header's 20px. */}
        <div className="absolute inset-y-0 right-0 left-4">
          <TriviumTerminalShell
            key={generation}
            cwd={cwd}
            visible={open}
            pasteRequest={pasteRequest}
            onPasteSettled={onPasteSettled}
            onRestart={restart}
          />
        </div>
      </div>
    </section>
  )
}
