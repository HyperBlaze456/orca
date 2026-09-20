import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { runtimeTargetForExecutionHostId } from '@/runtime/runtime-client-target'
import { translate } from '@/i18n/i18n'
import { isTriviumRecord, readTriviumWorkspaceProjection } from './trivium-workspace-query'

export type TriviumProjectionQuery =
  | { kind: 'tickets'; under?: string }
  | { kind: 'progress'; campaign?: string }
type ProjectionState = { identity: string; data?: Record<string, unknown>; error?: string }

export function useTriviumProjection(workspaceId: string, query: TriviumProjectionQuery) {
  const executionHostId = useAppStore((state) => getExecutionHostIdForWorktree(state, workspaceId))
  const kind = query.kind
  const scope = query.kind === 'tickets' ? query.under : query.campaign
  const [revision, setRevision] = useState(0)
  const identity = JSON.stringify([executionHostId, workspaceId, kind, scope, revision])
  const [state, setState] = useState<ProjectionState | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    const target = runtimeTargetForExecutionHostId(executionHostId)
    const load = async (): Promise<void> => {
      try {
        if (!target) {
          throw new Error(
            translate('trivium.inspect.unsupported', 'This host cannot provide these details.')
          )
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
          throw new Error(
            translate('trivium.inspect.invalid', 'The host returned an unreadable response.')
          )
        }
        if (result.supported === false) {
          throw new Error(
            translate('trivium.inspect.unsupported', 'This host cannot provide these details.')
          )
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
          throw new Error(
            translate('trivium.inspect.invalid', 'The host returned an unreadable response.')
          )
        }
        if (!abort.signal.aborted) {
          setState({ identity, data: result })
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setState({ identity, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    void load()
    return () => abort.abort()
  }, [executionHostId, workspaceId, kind, scope, revision, identity])
  const current = state?.identity === identity ? state : null
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    refresh: () => setRevision((value) => value + 1)
  }
}
