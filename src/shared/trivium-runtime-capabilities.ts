// Announces the five read-only `trivium.*` methods. An older host omits it and
// would answer `method_not_found`, so a client checks before offering the page.
export const TRIVIUM_WORKSPACE_RUNTIME_CAPABILITY = 'trivium.workspace.v1' as const

export const TRIVIUM_RUNTIME_CAPABILITIES = [TRIVIUM_WORKSPACE_RUNTIME_CAPABILITY] as const
