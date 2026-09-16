import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { hydrateShellPath, mergePathSegments, findExecutableOnPath, isExecutableFile } = vi.hoisted(
  () => ({
    hydrateShellPath: vi.fn(),
    mergePathSegments: vi.fn(),
    findExecutableOnPath: vi.fn(),
    isExecutableFile: vi.fn()
  })
)

vi.mock('../startup/hydrate-shell-path', () => ({ hydrateShellPath, mergePathSegments }))
vi.mock('../startup/path-executable-lookup', () => ({ findExecutableOnPath, isExecutableFile }))

import {
  TRIVIUM_EXECUTABLE_ENV_VAR,
  _resetTriviumExecutableForTests,
  resolveTriviumExecutable
} from './trivium-executable'

const originalOverride = process.env[TRIVIUM_EXECUTABLE_ENV_VAR]

beforeEach(() => {
  _resetTriviumExecutableForTests()
  hydrateShellPath.mockReset()
  mergePathSegments.mockReset()
  findExecutableOnPath.mockReset().mockReturnValue(null)
  isExecutableFile.mockReset().mockReturnValue(false)
  delete process.env[TRIVIUM_EXECUTABLE_ENV_VAR]
})

afterEach(() => {
  if (originalOverride === undefined) {
    delete process.env[TRIVIUM_EXECUTABLE_ENV_VAR]
  } else {
    process.env[TRIVIUM_EXECUTABLE_ENV_VAR] = originalOverride
  }
  _resetTriviumExecutableForTests()
})

describe('resolveTriviumExecutable', () => {
  it('honours an absolute TRIVIUM_EXECUTABLE without probing PATH', async () => {
    process.env[TRIVIUM_EXECUTABLE_ENV_VAR] = '/opt/trivium/bin/trivium'
    isExecutableFile.mockReturnValue(true)

    await expect(resolveTriviumExecutable()).resolves.toEqual({
      ok: true,
      program: '/opt/trivium/bin/trivium'
    })
    expect(findExecutableOnPath).not.toHaveBeenCalled()
    expect(hydrateShellPath).not.toHaveBeenCalled()
  })

  it('refuses a relative TRIVIUM_EXECUTABLE', async () => {
    process.env[TRIVIUM_EXECUTABLE_ENV_VAR] = 'trivium'

    await expect(resolveTriviumExecutable()).resolves.toMatchObject({
      ok: false,
      reason: 'not-found'
    })
    expect(hydrateShellPath).not.toHaveBeenCalled()
  })

  it('takes the launch PATH hit without probing the login shell', async () => {
    findExecutableOnPath.mockReturnValue('/usr/local/bin/trivium')

    await expect(resolveTriviumExecutable()).resolves.toEqual({
      ok: true,
      program: '/usr/local/bin/trivium'
    })
    expect(hydrateShellPath).not.toHaveBeenCalled()
  })

  it('hydrates the login shell PATH when the launch PATH misses', async () => {
    findExecutableOnPath.mockReturnValueOnce(null).mockReturnValue('/Users/me/.local/bin/trivium')
    hydrateShellPath.mockResolvedValue({
      ok: true,
      segments: ['/Users/me/.local/bin'],
      failureReason: 'none'
    })

    await expect(resolveTriviumExecutable()).resolves.toEqual({
      ok: true,
      program: '/Users/me/.local/bin/trivium'
    })
    expect(mergePathSegments).toHaveBeenCalledWith(['/Users/me/.local/bin'])
  })

  it('reports hydration-failed when the login shell could not be probed', async () => {
    hydrateShellPath.mockResolvedValue({ ok: false, segments: [], failureReason: 'timeout' })

    await expect(resolveTriviumExecutable()).resolves.toMatchObject({
      ok: false,
      reason: 'hydration-failed'
    })
  })

  it('reports not-found when the hydrated PATH still has no trivium', async () => {
    hydrateShellPath.mockResolvedValue({ ok: true, segments: ['/usr/bin'], failureReason: 'none' })

    await expect(resolveTriviumExecutable()).resolves.toMatchObject({
      ok: false,
      reason: 'not-found'
    })
  })

  it('caches the resolution until it is reset', async () => {
    findExecutableOnPath.mockReturnValue('/usr/local/bin/trivium')

    await resolveTriviumExecutable()
    await resolveTriviumExecutable()
    expect(findExecutableOnPath).toHaveBeenCalledTimes(1)

    _resetTriviumExecutableForTests()
    await resolveTriviumExecutable()
    expect(findExecutableOnPath).toHaveBeenCalledTimes(2)
  })
})
