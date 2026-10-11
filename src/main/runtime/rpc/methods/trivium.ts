import { defineMethod } from '../core'
import { WorktreeSelector } from '../../../../shared/rpc-contract/files-target-params'
import { TriviumProgress, TriviumTickets } from '../../../../shared/rpc-contract/trivium-params'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host'
import { callTriviumService } from '../../../trivium/trivium-service-supervisor'
import { isTriviumServiceError } from '../../../trivium/trivium-service-protocol'
import type { OrcaRuntimeService } from '../../orca-runtime'

type TriviumWorkspaceResult =
  | { supported: false; host: ExecutionHostId; reason: 'remote-execution-host' }
  | ({ supported: true; host: ExecutionHostId } & Record<string, unknown>)

/**
 * Reads one Trivium projection for the workspace named by `worktree`.
 *
 * A non-local execution host owns its own filesystem, so the answer is a typed
 * refusal naming that host — never a local read of a path that means something
 * else there (`docs/reference/ssh-execution-boundary.md`).
 */
async function readTriviumWorkspace(
  runtime: OrcaRuntimeService,
  worktreeSelector: string,
  method: string,
  extraParams: Record<string, unknown> = {}
): Promise<TriviumWorkspaceResult> {
  const target = await runtime.resolveTriviumWorkspaceTarget(worktreeSelector)
  if (target.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return { supported: false, host: target.executionHostId, reason: 'remote-execution-host' }
  }
  const host = target.executionHostId
  const params: Record<string, unknown> = { root: target.path }
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined) {
      params[key] = value
    }
  }
  try {
    const call = await callTriviumService(method, params)
    if (!call.ok) {
      return { supported: true, host, unavailable: call.unavailable }
    }
    const payload =
      typeof call.result === 'object' && call.result !== null && !Array.isArray(call.result)
        ? (call.result as Record<string, unknown>)
        : { result: call.result }
    return { supported: true, host, ...payload }
  } catch (error) {
    if (isTriviumServiceError(error)) {
      // A `{error}` reply is the service's own answer (`no-harness`, `model-error`),
      // so it keeps its slug instead of collapsing into a transport failure.
      return {
        supported: true,
        host,
        serviceError: { code: error.code, message: error.message }
      }
    }
    throw error
  }
}

export const TRIVIUM_METHODS = [
  defineMethod({
    name: 'trivium.availability',
    permission: 'workspace',
    params: null,
    // Why ping rather than a bare PATH lookup: an installed trivium whose
    // service refuses to start is not available, and the reason differs.
    handler: async () => {
      try {
        const call = await callTriviumService('ping')
        if (!call.ok) {
          return {
            available: false,
            reason: call.unavailable.reason,
            detail: call.unavailable.detail
          }
        }
        return {
          available: true,
          program: call.program,
          protocol: call.protocol,
          version: call.version
        }
      } catch (error) {
        if (isTriviumServiceError(error)) {
          return { available: false, reason: error.code, detail: error.message }
        }
        throw error
      }
    }
  }),
  defineMethod({
    name: 'trivium.status',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: (params, { runtime }) =>
      readTriviumWorkspace(runtime, params.worktree, 'workspace.status')
  }),
  defineMethod({
    name: 'trivium.progress',
    permission: 'workspace',
    params: TriviumProgress,
    handler: (params, { runtime }) =>
      readTriviumWorkspace(runtime, params.worktree, 'workspace.progress', {
        campaign: params.campaign,
        verbose: params.verbose
      })
  }),
  defineMethod({
    name: 'trivium.goals',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: (params, { runtime }) =>
      readTriviumWorkspace(runtime, params.worktree, 'workspace.goals')
  }),
  defineMethod({
    name: 'trivium.tickets',
    permission: 'workspace',
    params: TriviumTickets,
    handler: (params, { runtime }) =>
      readTriviumWorkspace(runtime, params.worktree, 'workspace.tickets', {
        query: params.query,
        under: params.under,
        state: params.state,
        status: params.status
      })
  })
]
