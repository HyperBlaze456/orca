import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  TriviumStatusRpcResult,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import { TRIVIUM_WORKSPACE_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { selectEditorExternalWatchTargets } from '@/hooks/editor-external-watch-targets'
import {
  getExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from '@/lib/worktree-runtime-owner'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import {
  getActiveRuntimeTarget,
  runtimeTargetForExecutionHostId,
  settingsForRuntimeOwner,
  type RuntimeClientTarget
} from '@/runtime/runtime-client-target'
import { subscribeRuntimeFileChanges } from '@/runtime/runtime-file-watch-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { useAppStore } from '@/store'

export type TriviumStatusPhase =
  | 'loading'
  | 'ready'
  | 'unsupported'
  | 'unavailable'
  | 'service-error'
  | 'error'

export type TriviumWorkspaceStatusResult = {
  phase: TriviumStatusPhase
  data: TriviumWorkspaceStatus | null
  host: string | null
  /** The service's own slug on `service-error`, otherwise a sentence or a refusal slug. */
  reason: string | null
  /** Second line of an `unavailable` or `service-error` verdict. */
  detail: string | null
  refresh: () => void
}

// Why: a Campaign step rewrites several journals in a burst; one refetch per burst.
const TRIVIUM_REFETCH_DEBOUNCE_MS = 300
const TRIVIUM_STATUS_TIMEOUT_MS = 20_000

const LOADING_RESULT = {
  phase: 'loading',
  data: null,
  host: null,
  reason: null,
  detail: null
} as const

type TriviumStatusState = Omit<TriviumWorkspaceStatusResult, 'refresh'>
/** A verdict plus the workspace/host it describes, so a stale one is recognizable on sight. */
type IdentifiedStatusState = TriviumStatusState & { identity: string }

function statusIdentity(executionHostId: string, workspaceId: string | null): string {
  return `${executionHostId}::${workspaceId ?? ''}`
}

const HARNESS_MARKER = '/.trivium/'
/** The five projection inputs of WORKSPACE-BRIDGE §5, relative to the harness root's `.trivium/`. */
const WATCHED_HARNESS_SUBPATHS = [
  'ledger/current.json',
  'model',
  'work/campaigns',
  'work/execution/features',
  'work/interview/sessions'
]

/**
 * True when a changed path is one of the five inputs the projection reads.
 *
 * Why the OUTERMOST `.trivium` and not the nearest: a worker checkout under
 * `work/execution/worktrees/` carries its own copied `.trivium`, and a Campaign writes
 * source files there constantly. Measuring from the first marker leaves those under
 * `work/execution/worktrees/…`, which matches none of the five, so worker churn is silent.
 */
export function isTriviumHarnessPath(absolutePath: string): boolean {
  const normalized = absolutePath.replaceAll('\\', '/')
  const marker = normalized.indexOf(HARNESS_MARKER)
  if (marker === -1) {
    return false
  }
  const relative = normalized.slice(marker + HARNESS_MARKER.length)
  return WATCHED_HARNESS_SUBPATHS.some(
    (subPath) => relative === subPath || relative.startsWith(`${subPath}/`)
  )
}

/** True when the app-level editor watcher already holds a local watch on `worktreePath`. */
function editorWatchesLocalPath(worktreePath: string): boolean {
  const { targets } = selectEditorExternalWatchTargets(useAppStore.getState())
  return targets.some(
    (target) => target.worktreePath === worktreePath && target.runtimeEnvironmentId === null
  )
}

function toStatusState(host: string, result: TriviumStatusRpcResult): TriviumStatusState {
  if (!result.supported) {
    return {
      phase: 'unsupported',
      data: null,
      host: result.host || host,
      reason: result.reason,
      detail: null
    }
  }
  if (result.unavailable) {
    return {
      phase: 'unavailable',
      data: null,
      host: result.host || host,
      reason: result.unavailable.reason,
      detail: result.unavailable.detail ?? null
    }
  }
  if (result.serviceError) {
    // Why a separate phase: a living service that answered `{error}` is a normal answer
    // (WORKSPACE-BRIDGE §4), so it must not read as a crash or a missing executable.
    return {
      phase: 'service-error',
      data: null,
      host: result.host || host,
      reason: result.serviceError.code,
      detail: result.serviceError.message
    }
  }
  if (!isWorkspaceStatusPayload(result)) {
    // Why: a reply that is not the §3 projection would render as a blank page of empty
    // sections. Report it the way the service's own refusals are reported.
    return {
      phase: 'service-error',
      data: null,
      host: result.host || host,
      reason: 'invalid-payload',
      detail: null
    }
  }
  // The supported envelope is the payload plus `supported`/`host`; the extra keys are inert.
  return { phase: 'ready', data: result, host: result.host || host, reason: null, detail: null }
}

/** The two fields every section reads; their absence means this is not a §3 projection. */
function isWorkspaceStatusPayload(result: { state?: unknown; goals?: unknown }): boolean {
  return (
    typeof result.state === 'string' &&
    typeof result.goals === 'object' &&
    result.goals !== null &&
    !Array.isArray(result.goals)
  )
}

/**
 * One `trivium.status` read, gated on the host actually announcing the methods.
 *
 * Why the capability probe: a host older than `trivium.workspace.v1` answers `method_not_found`,
 * which would surface as a generic failure. A typed refusal names the host instead.
 */
async function readTriviumStatus(
  target: RuntimeClientTarget,
  workspaceId: string
): Promise<TriviumStatusRpcResult> {
  if (target.kind === 'environment') {
    const supported = await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      TRIVIUM_WORKSPACE_RUNTIME_CAPABILITY
    )
    if (!supported) {
      return { supported: false, host: '', reason: 'remote-execution-host' }
    }
  }
  return callRuntimeRpc<TriviumStatusRpcResult>(
    target,
    'trivium.status',
    { worktree: toRuntimeWorktreeSelector(workspaceId) },
    { timeoutMs: TRIVIUM_STATUS_TIMEOUT_MS }
  )
}

/**
 * Track A harness state for one workspace, refetched whenever `.trivium/` changes.
 * Trivium runs on the execution host, so a host with no dispatchable runtime target
 * (direct SSH) reports `unsupported` rather than falling back to the local machine.
 */
export function useTriviumWorkspaceStatus(
  workspaceId: string | null,
  workspacePath: string | null,
  connectionId: string | null | undefined
): TriviumWorkspaceStatusResult {
  const settings = useAppStore((state) => state.settings)
  const executionHostId = useAppStore((state) => getExecutionHostIdForWorktree(state, workspaceId))
  const runtimeOwnerEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, workspaceId)
  )
  const target = useMemo(() => runtimeTargetForExecutionHostId(executionHostId), [executionHostId])
  // Why: the watch must follow the host that OWNS this workspace, not the globally focused
  // runtime — otherwise a remote workspace never sees its events and a local one under an
  // active environment starts no local watcher (useEditorExternalWatch does the same).
  const watchSettings = useMemo(
    () => settingsForRuntimeOwner(settings, runtimeOwnerEnvironmentId),
    [runtimeOwnerEnvironmentId, settings]
  )
  const identity = statusIdentity(executionHostId, workspaceId)
  const [state, setState] = useState<IdentifiedStatusState>(() => ({
    identity,
    ...LOADING_RESULT
  }))
  // Why: a workspace switch can land while the previous host is still answering;
  // only the newest request may write state.
  const requestIdRef = useRef(0)

  const load = useCallback(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const requestIdentity = statusIdentity(executionHostId, workspaceId)
    // Why: no dispatchable target (no workspace, or a direct-SSH host) is an unsupported
    // verdict with no host-supplied reason; the page owns that copy.
    if (!workspaceId || !target) {
      setState({
        identity: requestIdentity,
        phase: 'unsupported',
        data: null,
        host: executionHostId,
        reason: null,
        detail: null
      })
      return
    }
    void readTriviumStatus(target, workspaceId)
      .then((result) => {
        if (requestIdRef.current !== requestId) {
          return
        }
        setState({ identity: requestIdentity, ...toStatusState(executionHostId, result) })
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) {
          return
        }
        setState({
          identity: requestIdentity,
          phase: 'error',
          data: null,
          host: executionHostId,
          reason: error instanceof Error ? error.message : String(error),
          detail: null
        })
      })
  }, [executionHostId, target, workspaceId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!workspaceId || !workspacePath) {
      return
    }
    // Why: subscribeRuntimeFileChanges only starts a watcher on an environment target; on the
    // local path it just attaches a listener, and nothing else watches while this full-page
    // view is up (the Explorer is suppressed here). So own the watch on that path.
    const startsOwnWatch = getActiveRuntimeTarget(watchSettings).kind === 'environment'
    const ownsLocalWatch = !startsOwnWatch && connectionId !== undefined
    const localWatchArgs = { worktreePath: workspacePath, connectionId: connectionId ?? undefined }
    if (ownsLocalWatch) {
      // Why: freshness only — a refused watch still leaves Refresh working.
      void window.api.fs.watchWorktree(localWatchArgs).catch(() => {})
    }
    let disposed = false
    let debounceTimer: number | null = null
    let unsubscribe: (() => void) | null = null
    const scheduleRefetch = (): void => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        load()
      }, TRIVIUM_REFETCH_DEBOUNCE_MS)
    }
    void subscribeRuntimeFileChanges(
      {
        settings: watchSettings,
        worktreeId: workspaceId,
        worktreePath: workspacePath,
        connectionId: connectionId ?? undefined
      },
      (payload) => {
        if (payload.worktreePath !== workspacePath) {
          return
        }
        if (payload.events.some((event) => isTriviumHarnessPath(event.absolutePath))) {
          scheduleRefetch()
        }
      }
    )
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unsubscribe = dispose
      })
      // Why: losing the watcher costs freshness, not correctness — Retry still works.
      .catch(() => {})
    return () => {
      disposed = true
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      unsubscribe?.()
      // Why: the main process refcounts local watches per renderer, not per call site, so
      // unwatching a path the editor watcher also holds would silently kill its subscription.
      if (ownsLocalWatch && !editorWatchesLocalPath(workspacePath)) {
        void window.api.fs.unwatchWorktree(localWatchArgs)
      }
    }
  }, [connectionId, load, watchSettings, workspaceId, workspacePath])

  // Why: derived, not set from an effect — a workspace or host switch renders loading on the
  // same commit as the new props, instead of one frame of the previous workspace's verdict.
  // A refetch at the same identity keeps the current verdict on screen until its answer lands.
  const current: TriviumStatusState = state.identity === identity ? state : LOADING_RESULT
  return {
    phase: current.phase,
    data: current.data,
    host: current.host,
    reason: current.reason,
    detail: current.detail,
    refresh: load
  }
}
