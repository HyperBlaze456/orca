import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readFollowedLocalBuildManifestPath,
  watchFollowedLocalBuildManifest,
  writeFollowedLocalBuildManifestPath
} from './local-build-follow'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.()
  }
})

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-local-build-follow-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

describe('followed local build store', () => {
  it('returns null until a manifest path is remembered, then round-trips it', async () => {
    const userData = join(await makeTempDir(), 'userData')
    expect(await readFollowedLocalBuildManifestPath(userData)).toBeNull()

    await writeFollowedLocalBuildManifestPath(userData, '/builds/latest-mac.yml')
    expect(await readFollowedLocalBuildManifestPath(userData)).toBe('/builds/latest-mac.yml')

    await writeFollowedLocalBuildManifestPath(userData, null)
    expect(await readFollowedLocalBuildManifestPath(userData)).toBeNull()
    await writeFollowedLocalBuildManifestPath(userData, null)
  })

  it('ignores a malformed record instead of following garbage', async () => {
    const userData = await makeTempDir()
    await writeFile(join(userData, 'local-build-follow.json'), '{"manifestPath": 42}')
    expect(await readFollowedLocalBuildManifestPath(userData)).toBeNull()
  })
})

describe('watchFollowedLocalBuildManifest', () => {
  it('reports a replaced manifest once after the drop settles', async () => {
    const dir = await makeTempDir()
    const manifestPath = join(dir, 'latest-mac.yml')
    await writeFile(manifestPath, 'version: 1\n')
    const onChange = vi.fn()
    const watcher = watchFollowedLocalBuildManifest(manifestPath, onChange, {
      debounceMs: 100,
      pollIntervalMs: 60 * 60 * 1000
    })
    cleanups.push(() => watcher.close())

    await writeFile(join(dir, 'Orca-arm64-mac.zip'), 'zip')
    await writeFile(manifestPath, 'version: 2\n')
    await writeFile(manifestPath, 'version: 3\n')

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1), { timeout: 3_000 })
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('polls when the manifest folder does not exist yet', async () => {
    const dir = await makeTempDir()
    const onChange = vi.fn()
    const watcher = watchFollowedLocalBuildManifest(
      join(dir, 'missing', 'latest-mac.yml'),
      onChange,
      {
        debounceMs: 10,
        pollIntervalMs: 50
      }
    )
    cleanups.push(() => watcher.close())

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2_000 })
  })

  it('stops reporting after close', async () => {
    const dir = await makeTempDir()
    const manifestPath = join(dir, 'latest-mac.yml')
    await writeFile(manifestPath, 'version: 1\n')
    const onChange = vi.fn()
    const watcher = watchFollowedLocalBuildManifest(manifestPath, onChange, {
      debounceMs: 10,
      pollIntervalMs: 20
    })
    watcher.close()

    await writeFile(manifestPath, 'version: 2\n')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(onChange).not.toHaveBeenCalled()
  })
})
