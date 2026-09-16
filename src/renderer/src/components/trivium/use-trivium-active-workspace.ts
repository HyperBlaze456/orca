import { useMemo } from 'react'
import { getActiveSidebarWorkspaceId, parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { getFolderWorkspaceConnectionId } from '@/lib/folder-workspace-connection'
import { useAppStore } from '@/store'
import { useWorktreeById } from '@/store/selectors'

export type TriviumActiveWorkspace = {
  /** The runtime selector's bare id: a worktree id, or a `folder:<id>` key. */
  id: string
  name: string
  path: string
  /** SSH target owning `path`; null is the local machine, undefined is unresolved. */
  connectionId: string | null | undefined
}

/** The workspace the Trivium page reports on, whether it is a git worktree or a folder. */
export function useTriviumActiveWorkspace(): TriviumActiveWorkspace | null {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorkspaceKey = useAppStore((state) => state.activeWorkspaceKey)
  // Why: folder workspaces live only in the scoped key; activeWorktreeId alone misses them.
  const workspaceId = useMemo(
    () => getActiveSidebarWorkspaceId(activeWorkspaceKey, activeWorktreeId),
    [activeWorkspaceKey, activeWorktreeId]
  )
  const workspaceScope = workspaceId ? parseWorkspaceKey(workspaceId) : null
  const folderWorkspaceId =
    workspaceScope?.type === 'folder' ? workspaceScope.folderWorkspaceId : null
  const folderWorkspace = useAppStore((state) =>
    folderWorkspaceId
      ? (state.folderWorkspaces.find((workspace) => workspace.id === folderWorkspaceId) ?? null)
      : null
  )
  const folderConnectionId = useAppStore((state) =>
    folderWorkspaceId ? getFolderWorkspaceConnectionId(state, folderWorkspaceId) : null
  )
  const worktree = useWorktreeById(folderWorkspaceId ? null : workspaceId)
  const worktreeRepoId = worktree?.repoId ?? null
  const worktreeConnectionId = useAppStore((state) =>
    worktreeRepoId
      ? (state.repos.find((repo) => repo.id === worktreeRepoId)?.connectionId ?? null)
      : null
  )

  return useMemo(() => {
    if (!workspaceId) {
      return null
    }
    if (folderWorkspace) {
      return {
        id: workspaceId,
        name: folderWorkspace.name,
        path: folderWorkspace.folderPath,
        connectionId: folderConnectionId
      }
    }
    if (worktree) {
      return {
        id: workspaceId,
        name: worktree.displayName,
        path: worktree.path,
        connectionId: worktreeConnectionId
      }
    }
    return null
  }, [folderConnectionId, folderWorkspace, workspaceId, worktree, worktreeConnectionId])
}
