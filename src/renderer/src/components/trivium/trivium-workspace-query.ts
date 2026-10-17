import { TRIVIUM_WORKSPACE_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

export async function readTriviumWorkspaceProjection<T>(
  target: RuntimeClientTarget,
  workspaceId: string,
  method: 'trivium.status' | 'trivium.progress' | 'trivium.tickets',
  params: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<T | { supported: false; host: string; reason: string }> {
  if (target.kind === 'environment') {
    const supported = await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      TRIVIUM_WORKSPACE_RUNTIME_CAPABILITY
    )
    if (!supported) {
      return {
        supported: false,
        host: `runtime:${target.environmentId}`,
        reason: 'remote-execution-host'
      }
    }
  }
  return callRuntimeRpc<T>(
    target,
    method,
    { ...params, worktree: toRuntimeWorktreeSelector(workspaceId) },
    { timeoutMs: 20_000, signal }
  )
}

export function isTriviumRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
