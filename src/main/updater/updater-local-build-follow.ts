import { app } from 'electron'
import { compareAppVersions } from '../../shared/app-version'
import { profileStateBuildCompatibilityError } from '../../shared/profile-state-build-compatibility'
import type { ReleaseChannel } from '../../shared/release-channel'
import type { UpdateStatus } from '../../shared/update-status-types'
import type { LocalBuildCandidate } from '../local-builds/local-build-candidate'
import type { LocalBuildFollowWatcher } from '../local-builds/local-build-follow'
import { UpdaterDownloadInstall } from './updater-download-install'

// Why: the compatibility check needs the terminal daemon, which is still starting right after launch.
const FOLLOW_INITIAL_CHECK_DELAY_MS = 20_000
const FOLLOW_RETRY_DELAY_MS = 10 * 60 * 1000

export type LocalBuildFollowStore = {
  load: () => Promise<string | null>
  persist: (manifestPath: string | null) => Promise<void>
}

/**
 * Keeps following the manifest a local build was last chosen from (⌥ Check for Updates…), so a
 * newer build dropped there is validated, served and downloaded without the picker. The restart
 * stays the user's call through the ordinary "update ready" card.
 */
export abstract class UpdaterLocalBuildFollow extends UpdaterDownloadInstall {
  private followedManifestPath: string | null = null
  private followWatcher: LocalBuildFollowWatcher | null = null
  private followCheckTimer: ReturnType<typeof setTimeout> | null = null
  private followCheckInFlight = false
  private followStore: LocalBuildFollowStore | null = null
  // Why: electron-updater's autoDownload is off; the followed flow starts the download itself once 'available' lands.
  private pendingFollowedLocalBuildDownload = false

  protected async startFollowingLocalBuilds(store: LocalBuildFollowStore): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) {
      return
    }
    this.followStore = store
    const manifestPath = await store.load().catch((error: unknown) => {
      console.warn(`[updater] could not read the followed local build: ${String(error)}`)
      return null
    })
    if (!manifestPath) {
      return
    }
    this.followManifest(manifestPath)
    this.scheduleFollowedLocalBuildCheck(FOLLOW_INITIAL_CHECK_DELAY_MS)
  }

  protected stopFollowingLocalBuilds(): void {
    this.followWatcher?.close()
    this.followWatcher = null
    this.followedManifestPath = null
    if (this.followCheckTimer) {
      clearTimeout(this.followCheckTimer)
      this.followCheckTimer = null
    }
    void this.followStore?.persist(null).catch((error: unknown) => {
      console.warn(`[updater] could not forget the followed local build: ${String(error)}`)
    })
  }

  protected override onLocalBuildActivated(candidate: LocalBuildCandidate): void {
    if (!this.followStore || candidate.manifestPath === this.followedManifestPath) {
      return
    }
    this.followManifest(candidate.manifestPath)
    void this.followStore.persist(candidate.manifestPath).catch((error: unknown) => {
      console.warn(`[updater] could not remember the followed local build: ${String(error)}`)
    })
  }

  // Why: a deliberate jump to a published build means leaving local builds behind.
  protected override async checkForPinnedBuild(
    channel: ReleaseChannel,
    tag: string
  ): Promise<void> {
    if (this.followedManifestPath) {
      this.stopFollowingLocalBuilds()
    }
    await super.checkForPinnedBuild(channel, tag)
  }

  protected override sendStatus(status: UpdateStatus, options?: { force?: boolean }): void {
    super.sendStatus(status, options)
    if (!this.pendingFollowedLocalBuildDownload) {
      return
    }
    if (status.state === 'available' && this.activeUpdateSource === 'local') {
      this.pendingFollowedLocalBuildDownload = false
      setImmediate(() => this.downloadUpdate())
    } else if (status.state !== 'checking') {
      this.pendingFollowedLocalBuildDownload = false
    }
  }

  private followManifest(manifestPath: string): void {
    this.followWatcher?.close()
    this.followedManifestPath = manifestPath
    this.followWatcher = null
    void import('../local-builds/local-build-follow').then(
      ({ watchFollowedLocalBuildManifest }) => {
        if (this.followedManifestPath !== manifestPath) {
          return
        }
        this.followWatcher = watchFollowedLocalBuildManifest(manifestPath, () =>
          this.scheduleFollowedLocalBuildCheck(0)
        )
      }
    )
  }

  private scheduleFollowedLocalBuildCheck(delayMs: number): void {
    if (this.followCheckTimer) {
      clearTimeout(this.followCheckTimer)
    }
    this.followCheckTimer = setTimeout(() => {
      this.followCheckTimer = null
      void this.checkFollowedLocalBuild()
    }, delayMs)
    this.followCheckTimer.unref?.()
  }

  private isBusyForFollowedLocalBuild(): boolean {
    return (
      this.activeUpdateSource !== 'release' ||
      this.isPinnedBuildActive ||
      this.localBuildSelectionInProgress ||
      this.pinnedBuildSelectionInProgress ||
      this.downloadInFlight ||
      this.quitAndInstallInProgress ||
      this.currentStatus.state === 'checking' ||
      this.currentStatus.state === 'downloading' ||
      this.currentStatus.state === 'downloaded'
    )
  }

  private async checkFollowedLocalBuild(): Promise<void> {
    const manifestPath = this.followedManifestPath
    if (!manifestPath || this.followCheckInFlight) {
      return
    }
    if (this.isBusyForFollowedLocalBuild()) {
      this.scheduleFollowedLocalBuildCheck(FOLLOW_RETRY_DELAY_MS)
      return
    }
    this.followCheckInFlight = true
    let candidate: LocalBuildCandidate | null = null
    let activated = false
    try {
      const [{ loadLocalBuildCandidate }, { assertLocalBuildCompatibility }] = await Promise.all([
        import('../local-builds/local-build-candidate'),
        import('../local-builds/local-build-compatibility')
      ])
      candidate = await loadLocalBuildCandidate(manifestPath, process.arch)
      // Why newer-only: a rebuilt older manifest must not roll the app back behind the user's back.
      if (compareAppVersions(candidate.version, app.getVersion()) <= 0) {
        await candidate.close()
        candidate = null
        return
      }
      const compatibilityError = profileStateBuildCompatibilityError(
        app.getVersion(),
        candidate.version
      )
      if (compatibilityError) {
        throw new Error(compatibilityError)
      }
      await assertLocalBuildCompatibility(candidate.compatibility)
      console.info(`[updater] followed local build ${candidate.version} found at ${manifestPath}`)
      activated = true
      this.pendingFollowedLocalBuildDownload = true
      const owned = candidate
      candidate = null
      await this.activateLocalBuild(owned, { userInitiated: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.pendingFollowedLocalBuildDownload = false
      if (candidate) {
        await candidate.close().catch(() => undefined)
      }
      if (activated) {
        this.userInitiatedCheck = false
        this.sendLocalBuildErrorAndRestore(message)
      }
      console.warn(`[updater] followed local build check failed: ${message}`)
      this.scheduleFollowedLocalBuildCheck(FOLLOW_RETRY_DELAY_MS)
    } finally {
      this.followCheckInFlight = false
    }
  }
}
