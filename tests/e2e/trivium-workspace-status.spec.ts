/**
 * The Trivium page reads a real repository's `.trivium/` harness and renders it.
 *
 * This is the end-to-end proof for docs/track-a/WORKSPACE-BRIDGE.md §3: the
 * renderer asks the main process, the main process runs the real `trivium`
 * executable against the active workspace, and the returned `workspace-status`
 * payload reaches the DOM. A store-level test cannot cover it — the whole point
 * is the round trip through a spawned Python program on the execution host.
 *
 * Repo A is this workspace's own Trivium checkout (an initialized harness);
 * repo B is the fixture's seeded scratch repo, which has no `.trivium/` and must
 * land on the `no-harness` screen instead of an error.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import type { Page } from '@stablyai/playwright-test'
import { getStoreState, waitForSessionReady } from './helpers/store'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'

const REPO_A = '/Users/hyperblaze/Desktop/coding/harnesses/trivium'
const TRIVIUM_BIN = '/Users/hyperblaze/.local/bin/trivium'
const SCREENSHOT_DIR =
  '/private/tmp/claude-501/-Users-hyperblaze-Desktop-coding-harnesses-trivium/671be59e-96c9-456c-bba5-f0e35942cb2e/scratchpad'

type BridgeStatus = {
  state: string
  goals: {
    counts: Record<string, number>
    nodes: { id: string; tier: string; title: string }[]
  }
  tickets: { candidates: { approve_command: string }[] }
  milestone: { campaign_id: string; unknowns: number } | null
}

/**
 * The same payload the app is expected to render, read straight from the CLI.
 *
 * Why read it instead of hard-coding: repo A is a live harness whose Goal graph
 * moves. Comparing the DOM against the bridge's own answer is the contract that
 * matters, and the fixture guards below still fail loudly if repo A drifts away
 * from the state this spec was written for.
 */
function readBridgeStatus(): BridgeStatus {
  const raw = execFileSync(TRIVIUM_BIN, ['view', 'status', '--root', REPO_A], {
    encoding: 'utf8',
    timeout: 60_000
  })
  return JSON.parse(raw) as BridgeStatus
}

type Expectations = {
  state: string
  g0Title: string
  approveCommand: string
  milestoneCampaignId: string
}

function expectationsOrSkip(): Expectations {
  test.skip(!existsSync(TRIVIUM_BIN), `trivium executable not found at ${TRIVIUM_BIN}`)
  test.skip(!existsSync(path.join(REPO_A, '.trivium')), `${REPO_A} has no initialized harness`)
  const status = readBridgeStatus()
  const g0 = status.goals.nodes.find((node) => node.tier === 'g0')
  const candidate = status.tickets.candidates[0]
  // Fixture guards: if repo A no longer matches the documented fixture state the
  // spec would be asserting against something else, so fail here with the reason.
  expect(status.state, 'repo A is expected to be in the `review` state').toBe('review')
  expect(status.goals.counts.g0, 'repo A is expected to have exactly one G0').toBe(1)
  expect(status.goals.counts.g1, 'repo A is expected to have exactly one G1').toBe(1)
  expect(g0, 'repo A is expected to expose a G0 node').toBeTruthy()
  expect(candidate, 'repo A is expected to have one candidate ticket').toBeTruthy()
  expect(candidate.approve_command).toContain('trivium model ticket approve')
  expect(status.milestone, 'repo A is expected to stand at a milestone').toBeTruthy()
  expect(status.milestone!.unknowns).toBe(3)
  return {
    state: status.state,
    g0Title: g0!.title,
    approveCommand: candidate.approve_command,
    milestoneCampaignId: status.milestone!.campaign_id
  }
}

/** Drive navigation from the store, per tests/e2e/AGENTS.md; assert on the DOM after. */
async function openTriviumPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    store.getState().openTriviumPage()
  })
  await expect
    .poll(async () => getStoreState<string>(page, 'activeView'), { timeout: 10_000 })
    .toBe('trivium')
}

/** Activate the primary worktree of an already-attached repo, the way the helpers do. */
async function activateRepoWorktree(page: Page, repoPath: string, otherRepoPath: string) {
  const worktreeId = await page.evaluate(
    ({ repoPath, otherRepoPath }) => {
      const store = window.__store
      if (!store) {
        return null
      }
      const state = store.getState()
      // Why the fallback: repos.add may canonicalize the path it was given
      // (macOS /var -> /private/var), and only two repos are ever attached here.
      const repo =
        state.repos.find((candidate) => candidate.path === repoPath) ??
        state.repos.find((candidate) => candidate.path !== otherRepoPath)
      if (!repo) {
        return null
      }
      const worktrees = state.worktreesByRepo[repo.id] ?? []
      const primary = worktrees.find((worktree) => worktree.isMainWorktree) ?? worktrees[0]
      if (!primary) {
        return null
      }
      state.setActiveWorktree(primary.id)
      return primary.id
    },
    { repoPath, otherRepoPath }
  )
  expect(worktreeId, `no worktree surfaced for ${repoPath}`).toBeTruthy()
}

test.describe('with TRIVIUM_EXECUTABLE pointing at the installed CLI', () => {
  test.use({ orcaAppExtraEnv: { TRIVIUM_EXECUTABLE: TRIVIUM_BIN } })

  test('renders the harness of an initialized repo and the no-harness screen elsewhere', async ({
    orcaPage,
    testRepoPath
  }) => {
    test.setTimeout(300_000)
    const expected = expectationsOrSkip()

    await waitForSessionReady(orcaPage)
    await attachRepoAndOpenTerminal(orcaPage, REPO_A)
    await openTriviumPage(orcaPage)

    // Repo A: the bridge payload reaches the render layer.
    const stateBadge = orcaPage.locator(`[data-trivium-state="${expected.state}"]`)
    await expect(stateBadge).toBeVisible({ timeout: 60_000 })
    await expect(orcaPage.getByText(expected.g0Title, { exact: true })).toBeVisible()
    await orcaPage.getByRole('tab', { name: 'Workspace details' }).click()
    await expect(orcaPage.getByText(expected.approveCommand, { exact: true })).toBeVisible()
    await expect(orcaPage.getByText(expected.milestoneCampaignId, { exact: true })).toBeVisible()
    await orcaPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'trivium-review.png') })

    // Repo B: a git repo with no `.trivium/` is a normal state, not an error.
    await activateRepoWorktree(orcaPage, testRepoPath, REPO_A)
    await expect(orcaPage.locator('[data-trivium-state="no-harness"]')).toBeVisible({
      timeout: 60_000
    })
    await expect(orcaPage.getByText('trivium model init', { exact: true })).toBeVisible()
    await expect(stateBadge).not.toBeVisible()
    await orcaPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'trivium-no-harness.png') })
  })
})

test.describe('without TRIVIUM_EXECUTABLE', () => {
  test('finds trivium on the inherited or login-shell PATH', async ({ orcaPage }) => {
    test.setTimeout(300_000)
    const expected = expectationsOrSkip()

    await waitForSessionReady(orcaPage)
    await attachRepoAndOpenTerminal(orcaPage, REPO_A)
    await openTriviumPage(orcaPage)

    // Reaching a real state badge at all means the main process resolved and ran
    // the executable without the override.
    await expect(orcaPage.locator(`[data-trivium-state="${expected.state}"]`)).toBeVisible({
      timeout: 60_000
    })
  })
})
