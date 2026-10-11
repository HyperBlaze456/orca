import { PASTE_TERMINAL_TEXT_EVENT, type PasteTerminalTextDetail } from '@/constants/terminal'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'

// Same readiness rule as the onboarding inline terminal: rendered rows, or a PTY that has
// existed briefly (GPU renderers may never expose row text).
const READY_RETRY_MS = 100
const PTY_TEXT_FALLBACK_MS = 750
const INSERT_SETTLE_MS = 250
/** A shell that shows nothing by then is reported instead of waited on forever. */
export const TRIVIUM_TERMINAL_READY_TIMEOUT_MS = 5000

export type TriviumTerminalInsertOutcome = 'pasted' | 'timeout'

function findTerminalTabElement(tabId: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>('[data-terminal-tab-id]')) {
    if (element.dataset.terminalTabId === tabId) {
      return element
    }
  }
  return null
}

function hasRenderedRows(element: HTMLElement): boolean {
  // Why: pasting before the login shell draws its prompt can echo the command twice.
  return (element.querySelector('.xterm-rows')?.textContent?.trim() ?? '').length > 0
}

/**
 * Waits until the shell in `tabId` is ready, then pastes `text` once (never Enter) and moves
 * focus into the terminal. Returns a cancel function; `onSettled` is not called after cancel.
 */
export function pasteIntoTriviumTerminalWhenReady(
  tabId: string,
  text: string,
  onSettled: (outcome: TriviumTerminalInsertOutcome) => void
): () => void {
  const startedAt = Date.now()
  let canceled = false
  let timer: number | null = null
  let ptyFirstSeenAt: number | null = null

  const paste = (): void => {
    if (canceled) {
      return
    }
    window.dispatchEvent(
      new CustomEvent<PasteTerminalTextDetail>(PASTE_TERMINAL_TEXT_EVENT, {
        detail: { tabId, text: text.trim() }
      })
    )
    focusTerminalTabSurface(tabId)
    onSettled('pasted')
  }

  const poll = (): void => {
    timer = null
    if (canceled) {
      return
    }
    const element = findTerminalTabElement(tabId)
    const hasPty = Boolean(element?.querySelector('[data-pty-id]'))
    if (hasPty) {
      ptyFirstSeenAt ??= Date.now()
    } else {
      ptyFirstSeenAt = null
    }
    const settled = ptyFirstSeenAt !== null && Date.now() - ptyFirstSeenAt >= PTY_TEXT_FALLBACK_MS
    if (element && hasPty && (hasRenderedRows(element) || settled)) {
      timer = window.setTimeout(paste, INSERT_SETTLE_MS)
      return
    }
    if (Date.now() - startedAt >= TRIVIUM_TERMINAL_READY_TIMEOUT_MS) {
      onSettled('timeout')
      return
    }
    timer = window.setTimeout(poll, READY_RETRY_MS)
  }

  poll()
  return () => {
    canceled = true
    if (timer !== null) {
      window.clearTimeout(timer)
    }
  }
}

/** The `<…>` placeholders in a command, each once, in order of appearance. */
export function triviumCommandPlaceholders(command: string): string[] {
  const found = new Set<string>()
  for (const match of command.matchAll(/<[^<>\s]+>/g)) {
    found.add(match[0])
  }
  return [...found]
}
