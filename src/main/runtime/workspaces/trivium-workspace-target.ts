import { OrcaRuntimeWithResolveKnownWorkspaceFileTarget } from './known-workspace-file-target'
import type { ExecutionHostId } from '../../../shared/execution-host'

export type TriviumWorkspaceTarget = {
  path: string
  executionHostId: ExecutionHostId
}

export abstract class OrcaRuntimeWithTriviumWorkspaceTarget extends OrcaRuntimeWithResolveKnownWorkspaceFileTarget {
  /**
   * The absolute workspace path the Trivium service should read, and the host
   * that owns it. Folder workspaces resolve the same way git worktrees do; the
   * caller is responsible for refusing a non-local host rather than reading the
   * path here (`docs/reference/ssh-execution-boundary.md`).
   */
  async resolveTriviumWorkspaceTarget(worktreeSelector: string): Promise<TriviumWorkspaceTarget> {
    const target = await this.resolveRuntimeFileTarget(worktreeSelector)
    return { path: target.worktree.path, executionHostId: target.executionHostId }
  }
}
