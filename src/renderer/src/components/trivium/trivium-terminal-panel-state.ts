import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { brandEphemeralSetupTerminalWorktreeId } from '../../../../shared/ephemeral-setup-terminal-worktree-id'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { WORKTREE_ID_SEPARATOR } from '../../../../shared/worktree/id'
import { translate } from '@/i18n/i18n'
import { resolveTerminalWorktreeRoute } from '@/lib/terminal-worktree-route'
import { getKnownExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { readTriviumPageStorage, writeTriviumPageStorage } from './trivium-page-storage'
import type { TriviumTerminalInsertOutcome } from './trivium-terminal-command-insert'
import type { TriviumActiveWorkspace } from './use-trivium-active-workspace'

/**
 * The shell's terminal owner id. Branded so the terminal layer treats it as a setup terminal, never
 * a workspace tab. Why the `::<path>` tail: main anchors a startup cwd to the workspace root it
 * parses from the id (`repoId::path`); a bare branded id has none, so the shell would open in HOME.
 */
export function triviumTerminalWorktreeId(workspacePath: string): string {
  return brandEphemeralSetupTerminalWorktreeId(
    `trivium-terminal${WORKTREE_ID_SEPARATOR}${workspacePath}`
  )
}
/** A layout preference, so one key for every workspace. */
export const TRIVIUM_TERMINAL_OPEN_STORAGE_KEY = 'orca-trivium-page-v1:terminal-open'

export type TriviumTerminalAvailability =
  | { available: true }
  | { available: false; reason: 'no-workspace' | 'not-local' | 'remote-runtime' }

export type TriviumTerminalPasteRequest = { id: number; text: string; workspaceKey: string }

/** What the approval callout needs from the page's panel. */
export type TriviumTerminalControls = {
  availability: TriviumTerminalAvailability
  requestPaste: (text: string) => void
  /** The command whose last paste gave up waiting for the shell. */
  timedOutText: string | null
}

const OUTSIDE_THE_PAGE: TriviumTerminalControls = {
  availability: { available: false, reason: 'no-workspace' },
  requestPaste: () => {},
  timedOutText: null
}

export const TriviumTerminalControlsContext =
  createContext<TriviumTerminalControls>(OUTSIDE_THE_PAGE)

export function useTriviumTerminalControls(): TriviumTerminalControls {
  return useContext(TriviumTerminalControlsContext)
}

/** Where the panel's shell would run: this computer, another host, or a focused remote runtime. */
export type TriviumTerminalPlacement = 'local' | 'remote-host' | 'remote-runtime'

/** Local only: a shell for an SSH or unresolved workspace would open on the wrong machine. */
export function triviumTerminalAvailability(
  workspace: Pick<TriviumActiveWorkspace, 'connectionId'> | null,
  placement: TriviumTerminalPlacement
): TriviumTerminalAvailability {
  if (!workspace) {
    return { available: false, reason: 'no-workspace' }
  }
  if (workspace.connectionId !== null || placement === 'remote-host') {
    return { available: false, reason: 'not-local' }
  }
  return placement === 'remote-runtime'
    ? { available: false, reason: 'remote-runtime' }
    : { available: true }
}

export function triviumTerminalUnavailableText(
  availability: Extract<TriviumTerminalAvailability, { available: false }>
): string {
  switch (availability.reason) {
    case 'no-workspace':
      return translate('trivium.terminal.noWorkspace', 'Open a workspace to use the terminal.')
    case 'remote-runtime':
      return translate(
        'trivium.terminal.remoteRuntime',
        'The terminal is unavailable while a remote runtime is active.'
      )
    case 'not-local':
      return translate(
        'trivium.terminal.localOnly',
        'The terminal is available for local workspaces only.'
      )
  }
}

export function readTriviumTerminalOpen(): boolean {
  return readTriviumPageStorage(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY) === true
}

export function writeTriviumTerminalOpen(open: boolean): void {
  writeTriviumPageStorage(TRIVIUM_TERMINAL_OPEN_STORAGE_KEY, open)
}

/**
 * Both the workspace and the panel's shell must resolve to this computer. Why the second check:
 * a branded setup-terminal id spawns on a focused remote runtime when one is focused.
 */
function useTriviumTerminalPlacement(
  workspace: TriviumActiveWorkspace | null
): TriviumTerminalPlacement {
  const workspaceId = workspace?.id ?? null
  const workspacePath = workspace?.path ?? null
  return useAppStore((state) => {
    if (!workspaceId || workspacePath === null) {
      return 'remote-host'
    }
    const host = parseExecutionHostId(getKnownExecutionHostIdForWorktree(state, workspaceId))
    if (host?.kind !== 'local') {
      return 'remote-host'
    }
    const route = resolveTerminalWorktreeRoute(state, triviumTerminalWorktreeId(workspacePath))
    return route !== null && route.runtimeEnvironmentId === null ? 'local' : 'remote-runtime'
  })
}

export type TriviumTerminalPanelState = {
  availability: TriviumTerminalAvailability
  /** The panel is on screen. */
  shown: boolean
  /** The panel (and its shell) exists: opened once for this workspace, maybe hidden since. */
  mounted: boolean
  /** Workspace id and path; a new value means a new shell. */
  workspaceKey: string | null
  toggle: () => void
  hide: () => void
  pasteRequest: TriviumTerminalPasteRequest | null
  settlePaste: (request: TriviumTerminalPasteRequest, outcome: TriviumTerminalInsertOutcome) => void
  controls: TriviumTerminalControls
}

/** The page's terminal panel: open flag (kept across visits), lazy shell, paste requests. */
export function useTriviumTerminalPanel(
  workspace: TriviumActiveWorkspace | null
): TriviumTerminalPanelState {
  const placement = useTriviumTerminalPlacement(workspace)
  const connectionId = workspace?.connectionId
  const hasWorkspace = workspace !== null
  const availability = useMemo(
    () => triviumTerminalAvailability(hasWorkspace ? { connectionId } : null, placement),
    [connectionId, hasWorkspace, placement]
  )
  const workspaceKey = workspace ? JSON.stringify([workspace.id, workspace.path]) : null
  const [open, setOpen] = useState(readTriviumTerminalOpen)
  const [startedKey, setStartedKey] = useState<string | null>(null)
  const [pasteRequest, setPasteRequest] = useState<TriviumTerminalPasteRequest | null>(null)
  const [timedOutText, setTimedOutText] = useState<string | null>(null)
  const lastPasteId = useRef(0)

  const shown = availability.available && open
  // Why during render: the shell outlives a later hide, but a workspace switch ends it, so
  // returning to a workspace with the panel hidden starts nothing.
  const nextStartedKey = shown ? workspaceKey : startedKey === workspaceKey ? startedKey : null
  if (nextStartedKey !== startedKey) {
    setStartedKey(nextStartedKey)
  }
  // Why: a paste still waiting when the workspace changes must not fire on a later return.
  if (pasteRequest !== null && pasteRequest.workspaceKey !== workspaceKey) {
    setPasteRequest(null)
  }
  const mounted =
    availability.available && workspaceKey !== null && (shown || startedKey === workspaceKey)

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next)
    writeTriviumTerminalOpen(next)
  }, [])
  const toggle = useCallback(() => changeOpen(!open), [changeOpen, open])
  const hide = useCallback(() => changeOpen(false), [changeOpen])

  const available = availability.available
  const requestPaste = useCallback(
    (text: string) => {
      if (!available || workspaceKey === null) {
        return
      }
      lastPasteId.current += 1
      changeOpen(true)
      setTimedOutText(null)
      setPasteRequest({ id: lastPasteId.current, text, workspaceKey })
    },
    [available, changeOpen, workspaceKey]
  )
  const settlePaste = useCallback(
    (request: TriviumTerminalPasteRequest, outcome: TriviumTerminalInsertOutcome) => {
      setPasteRequest((current) => (current?.id === request.id ? null : current))
      setTimedOutText(outcome === 'timeout' ? request.text : null)
    },
    []
  )
  const controls = useMemo(
    () => ({ availability, requestPaste, timedOutText }),
    [availability, requestPaste, timedOutText]
  )

  return {
    availability,
    shown,
    mounted,
    workspaceKey,
    toggle,
    hide,
    pasteRequest: pasteRequest?.workspaceKey === workspaceKey ? pasteRequest : null,
    settlePaste,
    controls
  }
}
