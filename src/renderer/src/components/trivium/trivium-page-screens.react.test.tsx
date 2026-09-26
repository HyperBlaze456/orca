// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TriviumStatusRpcResult } from '../../../../shared/trivium-workspace-status'
import { useAppStore } from '@/store'
import {
  PAGE_AGENT_TARGET,
  PAGE_WORKTREE_ID,
  deferred,
  makeFolderWorkspace,
  pageRpc,
  resetPageStore,
  seedAgentSession,
  statusAnswer,
  stubPageApi,
  type PageApi,
  type PageMethod
} from './trivium-page-test-harness'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import TriviumPage from './TriviumPage'
import { TRIVIUM_SETUP_COMMAND } from './TriviumStateScreens'

const { call, supports, send } = vi.hoisted(() => ({
  call: vi.fn(),
  supports: vi.fn(),
  send: vi.fn()
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: call,
  runtimeEnvironmentSupportsCapability: supports
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: vi.fn(async () => () => {})
}))
vi.mock('@/lib/active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: send,
  activeAgentNotesSendFailureMessage: () => 'Session unavailable'
}))

let api: PageApi

function calls(method: PageMethod): number {
  return call.mock.calls.filter((entry) => entry[1] === method).length
}

function answering(status: TriviumStatusRpcResult): void {
  call.mockImplementation(pageRpc({ 'trivium.status': async () => status }))
}

async function findScreen(name: string): Promise<HTMLElement> {
  return waitFor(() => requireElement(document.querySelector(`[data-trivium-screen="${name}"]`)))
}

const noHarness = statusAnswer((status) => ({ ...status, state: 'no-harness', harness_root: null }))

beforeEach(() => {
  call.mockReset()
  supports.mockReset().mockResolvedValue(true)
  send.mockReset().mockResolvedValue({ status: 'sent' })
  resetPageStore()
  api = stubPageApi()
})
afterEach(cleanup)

describe('loading', () => {
  it('draws the frame in placeholders until the status answers', async () => {
    const status = deferred<unknown>()
    call.mockImplementation(pageRpc({ 'trivium.status': () => status.promise }))
    renderWithTooltips(<TriviumPage />)

    expect(screen.getByRole('status', { name: 'Reading harness state…' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize the structure pane' })).toBeInTheDocument()
    expect(document.querySelector('[data-trivium-state]')).toBeNull()
    expect(calls('trivium.tickets') + calls('trivium.progress')).toBe(0)

    await act(async () => status.resolve(statusAnswer()))
    await screen.findByRole('tree')
    expect(screen.queryByRole('status', { name: 'Reading harness state…' })).toBeNull()
  })
})

describe('no harness', () => {
  it('explains where the harness lives and offers the setup command, reading nothing else', async () => {
    answering(noHarness)
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('no-harness')

    expect(page).toHaveTextContent('This workspace has no Trivium harness')
    expect(within(page).getByText('.trivium/').tagName).toBe('CODE')
    const state = requireElement(document.querySelector('[data-trivium-state="no-harness"]'))
    expect(state).toHaveTextContent('Not set up in this workspace')
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    expect(document.querySelector('[data-trivium-changes], [data-trivium-info]')).toBeNull()

    // Without an agent session the button waits and says how to get one.
    expect(within(page).getByRole('button', { name: 'Ask the agent to set it up' })).toBeDisabled()
    expect(page).toHaveTextContent(
      'Start an agent session in this workspace to send requests from here.'
    )
    fireEvent.click(within(page).getByRole('button', { name: 'Copy command' }))
    await waitFor(() => expect(api.writeClipboardText).toHaveBeenCalledWith(TRIVIUM_SETUP_COMMAND))
    expect(calls('trivium.tickets') + calls('trivium.progress')).toBe(0)
  })

  it('sends the setup command to the selected agent session and names it', async () => {
    seedAgentSession(PAGE_WORKTREE_ID)
    answering(noHarness)
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('no-harness')

    const ask = within(page).getByRole('button', { name: 'Ask the agent to set it up' })
    await waitFor(() => expect(ask).toBeEnabled())
    await act(async () => fireEvent.click(ask))

    expect(send).toHaveBeenCalledWith({
      worktreeId: PAGE_WORKTREE_ID,
      prompt: TRIVIUM_SETUP_COMMAND,
      noteTarget: PAGE_AGENT_TARGET
    })
    await waitFor(() => expect(page).toHaveTextContent('Sent to Codex session'))
  })

  it('keeps the failure visible and never reroutes to a replaced terminal', async () => {
    send.mockResolvedValue({ status: 'status-unavailable' })
    seedAgentSession(PAGE_WORKTREE_ID)
    answering(noHarness)
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('no-harness')
    const ask = within(page).getByRole('button', { name: 'Ask the agent to set it up' })
    await waitFor(() => expect(ask).toBeEnabled())

    await act(async () => fireEvent.click(ask))
    await waitFor(() => expect(page).toHaveTextContent('Session unavailable'))
    expect(page).not.toHaveTextContent('Sent to')

    await act(async () => useAppStore.setState({ ptyIdsByTabId: { 'tab-a': ['replacement'] } }))
    expect(ask).toBeDisabled()
    fireEvent.click(ask)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends from a folder workspace through the same host-aware path', async () => {
    const folderId = 'folder:notes-1'
    useAppStore.setState({
      activeWorktreeId: null,
      activeWorkspaceKey: folderId,
      folderWorkspaces: [makeFolderWorkspace('notes-1', '/srv/notes-folder')]
    })
    seedAgentSession(folderId)
    answering(noHarness)
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('no-harness')

    expect(call).toHaveBeenCalledWith(
      { kind: 'local' },
      'trivium.status',
      { worktree: `id:${folderId}` },
      expect.anything()
    )
    const ask = within(page).getByRole('button', { name: 'Ask the agent to set it up' })
    await waitFor(() => expect(ask).toBeEnabled())
    await act(async () => fireEvent.click(ask))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ worktreeId: folderId }))
  })
})

describe('harness without an adopted Goal', () => {
  it.each(['no-adopted-goal', 'goal-draft'] as const)(
    'keeps the normal frame for %s and lets the Overview explain the next step',
    async (state) => {
      answering(statusAnswer((status) => ({ ...status, state })))
      renderWithTooltips(<TriviumPage />)
      await screen.findByRole('tree', { name: 'Goals and tickets' })
      expect(document.querySelector(`[data-trivium-state="${state}"]`)).not.toBeNull()
      expect(document.querySelector('[data-trivium-section="guidance"]')).not.toBeNull()
      expect(document.querySelector('[data-trivium-screen]')).toBeNull()
    }
  )
})

describe('refusals and failures', () => {
  it('names the host that cannot serve Trivium and its reason', async () => {
    answering({
      supported: false,
      host: 'ssh:build-box',
      reason: 'The remote Orca server has no trivium bridge.'
    })
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('unsupported')
    expect(page).toHaveTextContent('Trivium is not available on this host')
    expect(page).toHaveTextContent('ssh:build-box')
    expect(page).toHaveTextContent('The remote Orca server has no trivium bridge.')
    expect(document.querySelector('[data-trivium-state]')).toBeNull()
  })

  it('turns the remote-execution-host refusal slug into a sentence', async () => {
    answering({ supported: false, host: 'runtime:env-1', reason: 'remote-execution-host' })
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('unsupported')
    expect(page).toHaveTextContent('runtime:env-1')
    expect(page).not.toHaveTextContent('remote-execution-host')
    expect(page).toHaveTextContent('does not serve this host yet')
  })

  it('shows why trivium did not run, the override, and retries', async () => {
    answering({
      supported: true,
      host: 'local',
      unavailable: { reason: 'trivium was not found on PATH', detail: 'spawn trivium ENOENT' }
    })
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('unavailable')
    expect(page).toHaveTextContent('The trivium program did not run')
    expect(page).toHaveTextContent('trivium was not found on PATH')
    expect(page).toHaveTextContent('spawn trivium ENOENT')
    expect(page).toHaveTextContent('TRIVIUM_EXECUTABLE')

    call.mockImplementation(pageRpc())
    fireEvent.click(within(page).getByRole('button', { name: 'Retry' }))
    await screen.findByRole('tree')
  })

  it('renders a service error as an answer with its own code', async () => {
    answering({
      supported: true,
      host: 'local',
      serviceError: { code: 'model-error', message: 'current.json is not valid JSON' }
    })
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('service-error')
    expect(within(page).getByText('model-error').tagName).toBe('CODE')
    expect(page).toHaveTextContent('current.json is not valid JSON')
    expect(page).not.toHaveTextContent('TRIVIUM_EXECUTABLE')
    const before = calls('trivium.status')
    fireEvent.click(within(page).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(calls('trivium.status')).toBe(before + 1))
  })

  it('asks for a workspace when none is selected, without reading anything', async () => {
    useAppStore.setState({ activeWorktreeId: null, activeWorkspaceKey: null })
    call.mockImplementation(pageRpc())
    renderWithTooltips(<TriviumPage />)
    const page = await findScreen('no-workspace')
    expect(page).toHaveTextContent('No workspace selected')
    expect(document.querySelector('[data-trivium-state]')).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })
})
