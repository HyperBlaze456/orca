// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { readTriviumSnapshot, snapshotTriviumModel } from './trivium-change-markers'
import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { FIXTURE_ROOT, FIXTURE_TICKETS, fixtureHex } from './trivium-model-tables.fixture'
import { makeTriviumModelInput } from './trivium-model.fixture'
import { triviumPageStorageKey } from './trivium-page-storage'
import {
  PAGE_WORKTREE_ID,
  PAGE_WORKTREE_PATH,
  deferred,
  pageRpc,
  progressAnswer,
  resetPageStore,
  statusAnswer,
  stubPageApi,
  ticketsAnswer,
  type PageApi,
  type PageMethod
} from './trivium-page-test-harness'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import TriviumPage from './TriviumPage'

const { call, supports } = vi.hoisted(() => ({ call: vi.fn(), supports: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: call,
  runtimeEnvironmentSupportsCapability: supports
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: vi.fn(async () => () => {})
}))

const STORAGE_KEY = triviumPageStorageKey(PAGE_WORKTREE_ID, FIXTURE_ROOT)
const NEW_TICKET = 'ticket.search-overlap-check'
let api: PageApi

function calls(method: PageMethod): number {
  return call.mock.calls.filter((entry) => entry[1] === method).length
}

function header(): HTMLElement {
  return requireElement(document.querySelector('[data-trivium-header]'))
}

function staleNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-trivium-stale]')
}

async function renderPage(): Promise<void> {
  renderWithTooltips(<TriviumPage />)
  await screen.findByRole('tree', { name: 'Goals and tickets' })
}

async function detailsLoaded(): Promise<void> {
  await waitFor(() =>
    expect(document.querySelector('[data-trivium-section="campaigns"]')).not.toBeNull()
  )
}

/** The model as the user last saw it: one ticket not there yet, one renamed, one since removed. */
function lastVisit(): TriviumModel {
  const input = makeTriviumModelInput()
  const nodes = input.status.goals.nodes.filter((node) => node.id !== NEW_TICKET)
  const renamed = nodes.find((node) => node.id === 'ticket.sync-export')
  if (renamed) {
    renamed.title = 'Older title'
  }
  nodes.push({
    id: 'ticket.dropped',
    tier: 'g3',
    title: 'Dropped',
    statement: '',
    status: 'adopted'
  })
  input.status.goals.nodes = nodes
  return buildTriviumModel(input)
}

beforeEach(() => {
  call.mockReset()
  supports.mockReset().mockResolvedValue(true)
  resetPageStore()
  api = stubPageApi()
})
afterEach(cleanup)

describe('Trivium page frame', () => {
  it('draws one header band, then the structure beside the reader, with no back button or tabs', async () => {
    call.mockImplementation(pageRpc())
    await renderPage()

    expect(within(header()).getByRole('heading', { level: 1 })).toHaveTextContent('Trivium')
    const state = requireElement(header().querySelector('[data-trivium-state]'))
    expect(state).toHaveAttribute('data-trivium-state', 'review')
    expect(state).toHaveTextContent('Milestone ready for review')
    expect(
      state.querySelector('[data-trivium-icon="milestone"][data-value="review"]')
    ).not.toBeNull()
    expect(document.querySelector('[data-trivium-reader]')).not.toBeNull()
    expect(screen.getByRole('separator', { name: 'Resize the structure pane' })).toHaveAttribute(
      'aria-valuenow',
      '440'
    )
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(call).toHaveBeenCalledWith(
      { kind: 'local' },
      'trivium.status',
      { worktree: `id:${PAGE_WORKTREE_ID}` },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
    await detailsLoaded()
    expect(call).toHaveBeenCalledWith(
      { kind: 'local' },
      'trivium.tickets',
      { worktree: `id:${PAGE_WORKTREE_ID}`, under: undefined, state: 'all', status: 'all' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('reloads the status, the tickets and the progress on Refresh', async () => {
    call.mockImplementation(pageRpc())
    await renderPage()
    await detailsLoaded()
    expect([calls('trivium.status'), calls('trivium.tickets'), calls('trivium.progress')]).toEqual([
      1, 1, 1
    ])

    fireEvent.click(within(header()).getByRole('button', { name: 'Refresh' }))

    await waitFor(() =>
      expect([
        calls('trivium.status'),
        calls('trivium.tickets'),
        calls('trivium.progress')
      ]).toEqual([2, 2, 2])
    )
  })

  it('leaves on Escape unless a text field owns the key', async () => {
    const close = vi.fn()
    useAppStore.setState({ closeTriviumPage: close })
    call.mockImplementation(pageRpc())
    await renderPage()

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Filter goals and tickets' }), {
      key: 'Escape'
    })
    expect(close).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('owns the local file watch while the page is mounted', async () => {
    call.mockImplementation(pageRpc())
    const view = renderWithTooltips(<TriviumPage />)
    await screen.findByRole('tree')
    const watched = { worktreePath: PAGE_WORKTREE_PATH, connectionId: undefined }
    expect(api.watchWorktree).toHaveBeenCalledWith(watched)
    expect(api.unwatchWorktree).not.toHaveBeenCalled()
    view.unmount()
    expect(api.unwatchWorktree).toHaveBeenCalledWith(watched)
  })
})

describe('stale data', () => {
  it('keeps the data after a failed refresh, says so with the time, and Retry reads again', async () => {
    let offline = false
    call.mockImplementation(
      pageRpc({
        'trivium.status': async () => {
          if (offline) {
            throw new Error('Execution host is unreachable.')
          }
          return statusAnswer()
        }
      })
    )
    await renderPage()
    await detailsLoaded()
    expect(staleNotice()).toBeNull()

    offline = true
    fireEvent.click(within(header()).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(staleNotice()).not.toBeNull())
    const notice = requireElement(staleNotice())
    expect(notice).toHaveTextContent(/^Can't reach Trivium\. Showing data from \d{2}:\d{2}\./)
    expect(notice.textContent).not.toMatch(/ended/i)
    expect(screen.getByRole('tree')).toBeInTheDocument()
    expect(header().querySelector('[data-trivium-state="review"]')).not.toBeNull()
    expect(document.querySelector('[data-trivium-section="campaigns"]')).not.toBeNull()

    offline = false
    const before = calls('trivium.status')
    fireEvent.click(within(notice).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(staleNotice()).toBeNull())
    expect(calls('trivium.status')).toBe(before + 1)
  })

  it('marks ticket records stale when only their reload fails', async () => {
    let failTickets = false
    call.mockImplementation(
      pageRpc({
        'trivium.tickets': async () => {
          if (failTickets) {
            throw new Error('The tickets read timed out.')
          }
          return ticketsAnswer()
        }
      })
    )
    await renderPage()
    await detailsLoaded()

    failTickets = true
    fireEvent.click(within(header()).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(staleNotice()).not.toBeNull())
    // The records on screen stay usable: no "Couldn't load tickets." in the reader.
    expect(document.querySelector('[data-trivium-pending="error"]')).toBeNull()
  })

  it('shows no stale notice when the first read fails: nothing is on screen yet', async () => {
    call.mockImplementation(
      pageRpc({
        'trivium.status': async () => {
          throw new Error('Execution host is unreachable.')
        }
      })
    )
    renderWithTooltips(<TriviumPage />)
    const screenElement = await waitFor(() =>
      requireElement(document.querySelector('[data-trivium-screen="unreachable"]'))
    )
    expect(screenElement).toHaveTextContent("Can't reach Trivium")
    expect(screenElement).toHaveTextContent('Execution host is unreachable.')
    expect(staleNotice()).toBeNull()
    expect(screen.queryByRole('tree')).toBeNull()

    call.mockImplementation(pageRpc())
    fireEvent.click(within(screenElement).getByRole('button', { name: 'Retry' }))
    await screen.findByRole('tree')
  })
})

describe('changes since the last visit', () => {
  it('marks nothing on a first visit', async () => {
    call.mockImplementation(pageRpc())
    await renderPage()
    expect(header().querySelector('[data-trivium-changes]')).toBeNull()
  })

  it('counts new, changed and removed items, opens them, and marks them seen', async () => {
    localStorage.setItem(
      `${STORAGE_KEY}:changes`,
      JSON.stringify(snapshotTriviumModel(lastVisit(), 1))
    )
    call.mockImplementation(pageRpc())
    await renderPage()

    const chip = within(header()).getByRole('button', { name: '1 new · 1 changed · 1 removed' })
    fireEvent.click(chip)
    const popover = screen.getByRole('dialog', { name: 'Changes since your last visit' })
    const title = FIXTURE_TICKETS.find((row) => row.id === NEW_TICKET)?.title ?? ''
    expect(within(popover).getByText(title)).toBeInTheDocument()
    expect(within(popover).getByText('Title changed')).toBeInTheDocument()
    expect(within(popover).getByText('No longer in the Goal model')).toBeInTheDocument()
    expect(within(popover).getByText('Dropped')).toBeInTheDocument()

    fireEvent.click(
      requireElement(popover.querySelector(`[data-trivium-change-item="${NEW_TICKET}"]`))
    )
    await waitFor(() =>
      expect(
        document.querySelector(`[data-trivium-page="ticket"][data-trivium-item="${NEW_TICKET}"]`)
      ).not.toBeNull()
    )

    fireEvent.click(within(header()).getByRole('button', { name: '1 new · 1 changed · 1 removed' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Changes since your last visit' })).getByRole(
        'button',
        { name: 'Mark as seen' }
      )
    )
    await waitFor(() => expect(header().querySelector('[data-trivium-changes]')).toBeNull())
    // The chip that held focus is gone; focus lands on Refresh, not on the page body.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(header()).getByRole('button', { name: 'Refresh' }))
    )
    const stored = readTriviumSnapshot(
      JSON.parse(localStorage.getItem(`${STORAGE_KEY}:changes`) ?? 'null')
    )
    expect(Object.keys(stored?.items ?? {})).toContain(NEW_TICKET)
    expect(Object.keys(stored?.items ?? {})).not.toContain('ticket.dropped')
  })
})

describe('workspace details', () => {
  it('lists the harness, the model revision with Copy, theory, history and interviews', async () => {
    call.mockImplementation(pageRpc())
    await renderPage()
    await detailsLoaded()

    fireEvent.click(within(header()).getByRole('button', { name: 'Workspace details' }))
    const popover = screen.getByRole('dialog', { name: 'Workspace details' })
    const revision = `sha256:${fixtureHex('revision', 64)}`
    expect(popover).toHaveTextContent(FIXTURE_ROOT)
    expect(within(popover).getByText(fixtureHex('revision', 12))).toBeInTheDocument()
    expect(popover.querySelector(`[data-trivium-copy="${revision}"]`)).not.toBeNull()
    expect(popover).toHaveTextContent('49 nodes · 14 promoted · 35 from milestones')
    expect(popover).toHaveTextContent('6 Campaigns · 21 features · 22 publications')
    expect(popover).toHaveTextContent('notes-scope (goal drafted)')
    expect(popover).toHaveTextContent('sync-tracks (goal reviewed)')

    fireEvent.click(within(popover).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(api.writeClipboardText).toHaveBeenCalledWith(revision))
  })
})

describe('detail reads reach the reader', () => {
  it('shows progress sections as loading, then the failure with Retry, then the data', async () => {
    const tickets = deferred<unknown>()
    const progress = deferred<unknown>()
    call.mockImplementation(
      pageRpc({
        'trivium.tickets': () => tickets.promise,
        'trivium.progress': () => progress.promise
      })
    )
    await renderPage()
    const pending = requireElement(
      document.querySelector('[data-trivium-section="progress-pending"]')
    )
    expect(pending.querySelector('[data-trivium-pending="loading"]')).not.toBeNull()

    await act(async () => progress.reject(new Error('The progress read timed out.')))
    await waitFor(() =>
      expect(pending.querySelector('[data-trivium-pending="error"]')).not.toBeNull()
    )
    expect(pending).toHaveTextContent("Couldn't load progress details.")
    // A failed first read has no older data to keep, so it is not a stale notice.
    expect(staleNotice()).toBeNull()

    call.mockImplementation(pageRpc({ 'trivium.tickets': () => tickets.promise }))
    fireEvent.click(within(pending).getByRole('button', { name: 'Retry' }))
    await detailsLoaded()
    expect(calls('trivium.progress')).toBe(2)
    await act(async () => tickets.resolve(ticketsAnswer()))
  })

  it('says ticket records failed where work is counted from them (installed binary)', async () => {
    call.mockImplementation(
      pageRpc({
        'trivium.status': async () => statusAnswer(),
        'trivium.tickets': async () => {
          throw new Error('The tickets read timed out.')
        },
        'trivium.progress': async () => progressAnswer('installed')
      })
    )
    await renderPage()
    const goals = await waitFor(() =>
      requireElement(document.querySelector('[data-trivium-section="goals"]'))
    )
    await waitFor(() => expect(goals).toHaveTextContent("Couldn't load tickets."))
    expect(within(goals).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
