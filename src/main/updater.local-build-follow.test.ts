import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const {
  autoUpdaterMock,
  chooseLocalBuildMock,
  closeLocalBuildFeedMock,
  startLocalBuildFeedMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () => (await import('./updater-test-harness')).createUpdaterMocks())

const followMocks = vi.hoisted(() => {
  const state: { onChange: (() => void) | null } = { onChange: null }
  return {
    loadLocalBuildCandidate: vi.fn(),
    assertLocalBuildCompatibility: vi.fn(),
    watchFollowedLocalBuildManifest: vi.fn(),
    watcherClose: vi.fn(),
    state
  }
})

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())
vi.mock('./local-builds/local-build-candidate', () => ({
  loadLocalBuildCandidate: followMocks.loadLocalBuildCandidate
}))
vi.mock('./local-builds/local-build-compatibility', () => ({
  assertLocalBuildCompatibility: followMocks.assertLocalBuildCompatibility
}))
vi.mock('./local-builds/local-build-follow', () => ({
  watchFollowedLocalBuildManifest: followMocks.watchFollowedLocalBuildManifest
}))

warmUpdaterModule()

const MANIFEST = '/builds/latest-mac.yml'

function candidateFor(version: string): {
  version: string
  manifestPath: string
  manifestContent: string
  artifacts: Map<string, never>
  compatibility: Record<string, never>
  close: ReturnType<typeof vi.fn>
} {
  return {
    version,
    manifestPath: MANIFEST,
    manifestContent: `version: ${version}`,
    artifacts: new Map<string, never>(),
    compatibility: {},
    close: vi.fn().mockResolvedValue(undefined)
  }
}

async function setupFollowing(
  persist = vi.fn().mockResolvedValue(undefined),
  manifestPath: string | null = MANIFEST
): Promise<{ send: ReturnType<typeof vi.fn>; persist: ReturnType<typeof vi.fn> }> {
  const send = vi.fn()
  const { setupAutoUpdater } = await loadUpdaterModule()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The mocked updater only reads webContents.send from this window fixture.
  setupAutoUpdater({ webContents: { send } } as never, {
    getLastUpdateCheckAt: () => Date.now(),
    getFollowedLocalBuildManifestPath: async () => manifestPath,
    setFollowedLocalBuildManifestPath: persist
  })
  if (manifestPath) {
    await vi.waitFor(() =>
      expect(followMocks.watchFollowedLocalBuildManifest).toHaveBeenCalledWith(
        manifestPath,
        expect.any(Function)
      )
    )
  }
  return { send, persist }
}

describe.runIf(process.platform === 'darwin')('updater: followed local builds', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    followMocks.loadLocalBuildCandidate.mockReset()
    followMocks.assertLocalBuildCompatibility.mockReset().mockResolvedValue({
      liveTerminalCount: 0,
      liveDaemonProtocols: []
    })
    followMocks.watcherClose.mockReset()
    followMocks.state.onChange = null
    followMocks.watchFollowedLocalBuildManifest
      .mockReset()
      .mockImplementation((_path: string, onChange: () => void) => {
        followMocks.state.onChange = onChange
        return { close: followMocks.watcherClose }
      })
    autoUpdaterMock.downloadUpdate.mockResolvedValue(undefined)
  })

  it('serves a newer followed build and starts its download without the picker', async () => {
    const candidate = candidateFor('1.0.52-local.2')
    followMocks.loadLocalBuildCandidate.mockResolvedValue(candidate)
    autoUpdaterMock.checkForUpdates.mockImplementation(() => {
      autoUpdaterMock.emit('checking-for-update')
      autoUpdaterMock.emit('update-available', { version: '1.0.52-local.2' })
      return Promise.resolve(undefined)
    })
    const { send } = await setupFollowing()

    followMocks.state.onChange?.()

    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))
    expect(chooseLocalBuildMock).not.toHaveBeenCalled()
    expect(followMocks.loadLocalBuildCandidate).toHaveBeenCalledWith(MANIFEST, process.arch)
    expect(startLocalBuildFeedMock).toHaveBeenCalledWith(candidate)
    expect(autoUpdaterMock.setFeedURL).toHaveBeenLastCalledWith({
      provider: 'generic',
      url: 'http://127.0.0.1:1234/token/'
    })
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        'updater:status',
        expect.objectContaining({ state: 'available', version: '1.0.52-local.2', source: 'local' })
      )
    )
    await vi.waitFor(() => expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1))
  })

  it('leaves a followed build alone when it is not newer than the running app', async () => {
    const candidate = candidateFor('1.0.51')
    followMocks.loadLocalBuildCandidate.mockResolvedValue(candidate)
    await setupFollowing()

    followMocks.state.onChange?.()

    await vi.waitFor(() => expect(candidate.close).toHaveBeenCalledTimes(1))
    expect(startLocalBuildFeedMock).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
  })

  it('does not start a download for a build the user picked by hand', async () => {
    chooseLocalBuildMock.mockResolvedValue(candidateFor('0.9.0-local.1'))
    autoUpdaterMock.checkForUpdates.mockImplementation(() => {
      autoUpdaterMock.emit('checking-for-update')
      autoUpdaterMock.emit('update-available', { version: '0.9.0-local.1' })
      return Promise.resolve(undefined)
    })
    const { send } = await setupFollowing(vi.fn().mockResolvedValue(undefined), null)
    const { checkForUpdatesFromMenu } = await loadUpdaterModule()

    checkForUpdatesFromMenu({ localBuild: true })

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        'updater:status',
        expect.objectContaining({ state: 'available', version: '0.9.0-local.1', source: 'local' })
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
  })

  it('remembers the manifest a build was picked from and follows it', async () => {
    chooseLocalBuildMock.mockResolvedValue(candidateFor('0.9.0-local.1'))
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined)
    const persist = vi.fn().mockResolvedValue(undefined)
    await setupFollowing(persist, null)
    const { checkForUpdatesFromMenu } = await loadUpdaterModule()

    checkForUpdatesFromMenu({ localBuild: true })

    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(MANIFEST))
    expect(followMocks.watchFollowedLocalBuildManifest).toHaveBeenCalledWith(
      MANIFEST,
      expect.any(Function)
    )
  })

  it('stops following when the user jumps to a published build', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined)
    await setupFollowing(persist)
    const { checkForUpdatesFromMenu } = await loadUpdaterModule()

    checkForUpdatesFromMenu({ channel: 'stable', targetTag: 'v1.0.52' })

    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(null))
    expect(followMocks.watcherClose).toHaveBeenCalledTimes(1)
    expect(closeLocalBuildFeedMock).not.toHaveBeenCalled()
  })
})
