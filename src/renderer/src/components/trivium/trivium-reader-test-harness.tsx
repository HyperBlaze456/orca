import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TriviumLoadState, TriviumReaderLoadState } from './trivium-reader-load'
import type { TriviumNavigation, TriviumRoute } from './use-trivium-navigation'

export type ReaderNavigationStub = TriviumNavigation & {
  openItem: ReturnType<typeof vi.fn<TriviumNavigation['openItem']>>
  openTickets: ReturnType<typeof vi.fn<TriviumNavigation['openTickets']>>
  openOverview: ReturnType<typeof vi.fn<TriviumNavigation['openOverview']>>
}

/** A navigation whose calls are recorded; the route stays where the test put it. */
export function makeReaderNavigation(
  route: TriviumRoute = { view: 'overview' }
): ReaderNavigationStub {
  return {
    route,
    selectedKey: null,
    expanded: new Set(),
    openOverview: vi.fn<TriviumNavigation['openOverview']>(),
    openTickets: vi.fn<TriviumNavigation['openTickets']>(),
    openItem: vi.fn<TriviumNavigation['openItem']>(),
    selectEntry: vi.fn<TriviumNavigation['selectEntry']>(),
    toggle: vi.fn<TriviumNavigation['toggle']>()
  }
}

export function makeLoadState(
  tickets: TriviumLoadState = 'ready',
  progress: TriviumLoadState = 'ready'
): TriviumReaderLoadState & { retry: ReturnType<typeof vi.fn<() => void>> } {
  return { tickets, progress, retry: vi.fn<() => void>() }
}

/** Renders inside a TooltipProvider; `rerender` keeps the provider, so state survives. */
export function renderWithTooltips(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: TooltipProvider })
}

/** The element a query found; fails the test when it found nothing. */
export function requireElement(value: unknown): HTMLElement {
  if (!(value instanceof HTMLElement)) {
    throw new Error('Expected an HTML element')
  }
  return value
}

export function requireTextArea(value: unknown): HTMLTextAreaElement {
  if (!(value instanceof HTMLTextAreaElement)) {
    throw new Error('Expected a textarea')
  }
  return value
}

/** `data-trivium-section` names in document order. */
export function sectionNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-trivium-section]')].map(
    (element) => element.getAttribute('data-trivium-section') ?? ''
  )
}

/** Installs the clipboard bridge the copy buttons call; returns the spy. */
export function stubClipboard(): ReturnType<typeof vi.fn<(text: string) => Promise<void>>> {
  const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText } }
  })
  return writeClipboardText
}
