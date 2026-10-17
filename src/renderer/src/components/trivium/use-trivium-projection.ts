import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/runtime-client-target'
import { translate } from '@/i18n/i18n'
import { readTriviumTickets } from './trivium-ticket-records'
import { isTriviumRecord, readTriviumWorkspaceProjection } from './trivium-workspace-query'

export type TriviumProjectionQuery =
  | { kind: 'tickets'; under?: string }
  | { kind: 'progress'; campaign?: string }

export type TriviumProjection = {
  /** The last answer for this workspace and query; kept while a later read fails. */
  data: Record<string, unknown> | undefined
  /** Why the latest read failed; cleared by the next successful answer. */
  error: string | undefined
  /** A read for the current request or refresh token is still in flight. */
  loading: boolean
  updatedAt: number | undefined
  refresh: () => void
}

type ProjectionState = {
  identity: string
  request: string
  /** The refresh token the settled read was started for. */
  token: unknown
  data?: Record<string, unknown>
  error?: string
  updatedAt?: number
}

function unreadable(): Error {
  return new Error(
    translate('trivium.inspect.invalid', 'The host returned an unreadable response.')
  )
}

function unsupported(): Error {
  return new Error(
    translate('trivium.inspect.unsupported', 'This host cannot provide these details.')
  )
}

/**
 * One read-only `trivium.tickets` or `trivium.progress` projection. A null workspace reads
 * nothing; a new `refreshToken` (the page passes the status answer count) reads again.
 */
export function useTriviumProjection(
  workspaceId: string | null,
  query: TriviumProjectionQuery,
  refreshToken?: unknown
): TriviumProjection {
  const executionHostId = useAppStore((state) => getExecutionHostIdForWorktree(state, workspaceId))
  const kind = query.kind
  const scope = query.kind === 'tickets' ? query.under : query.campaign
  const [revision, setRevision] = useState(0)
  const identity = JSON.stringify([executionHostId, workspaceId, kind, scope])
  const request = JSON.stringify([identity, revision])
  const [state, setState] = useState<ProjectionState | null>(null)
  useEffect(() => {
    if (workspaceId === null) {
      return
    }
    const abort = new AbortController()
    const target = runtimeRpcTargetForAuthorityKey(executionHostId)
    const load = async (): Promise<void> => {
      try {
        if (!target) {
          throw unsupported()
        }
        const result = await readTriviumWorkspaceProjection<unknown>(
          target,
          workspaceId,
          kind === 'tickets' ? 'trivium.tickets' : 'trivium.progress',
          kind === 'tickets'
            ? { under: scope, state: 'all', status: 'all' }
            : { campaign: scope, verbose: true },
          abort.signal
        )
        if (!isTriviumRecord(result)) {
          throw unreadable()
        }
        if (result.supported === false) {
          throw unsupported()
        }
        for (const key of ['unavailable', 'serviceError', 'error']) {
          const error = result[key]
          if (isTriviumRecord(error)) {
            throw new Error(String(error.message ?? error.reason ?? error.code))
          }
        }
        if (
          kind === 'tickets' ? !Array.isArray(result.tickets) : !Array.isArray(result.campaigns)
        ) {
          throw unreadable()
        }
        if (kind === 'tickets') {
          // Throws on a row without an id, so stored ticket data always decodes.
          readTriviumTickets(result)
        }
        if (!abort.signal.aborted) {
          setState({ identity, request, token: refreshToken, data: result, updatedAt: Date.now() })
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          // Why: a failed refresh keeps the last answer on screen (stale, never "ended").
          setState((previous) => ({
            ...(previous?.identity === identity ? previous : {}),
            identity,
            request,
            token: refreshToken,
            error: error instanceof Error ? error.message : String(error)
          }))
        }
      }
    }
    void load()
    return () => abort.abort()
  }, [executionHostId, workspaceId, kind, scope, identity, request, refreshToken])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const current = state?.identity === identity ? state : null
  return {
    data: current?.data,
    error: current?.error,
    loading:
      workspaceId !== null &&
      (!current || current.request !== request || current.token !== refreshToken),
    updatedAt: current?.updatedAt,
    refresh
  }
}
