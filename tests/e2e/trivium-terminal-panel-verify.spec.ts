/**
 * Verifier cases for the Trivium page's terminal panel (WO-5): Escape inside the real xterm,
 * focus after hiding, and that the shell's PTY dies when the workspace changes or the page
 * closes, with no ephemeral tab left behind. Every window stays hidden.
 */

import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { getActiveWorktreeId, getAllWorktreeIds, waitForSessionReady } from './helpers/store'

const SHELL_ID_PREFIX = 'ephemeral-setup-terminal:trivium-terminal'

async function expectEveryWindowHidden(app: ElectronApplication): Promise<void> {
  const visibility = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.isVisible())
  )
  expect(visibility.length).toBeGreaterThan(0)
  expect(visibility.every((visible) => !visible)).toBe(true)
}

async function openTriviumPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    await window.__store?.getState().updateSettingsOrThrow({ uiLanguage: 'en' })
    window.__store?.getState().openTriviumPage()
  })
  await expect(page.locator('[data-trivium-header]')).toBeVisible({ timeout: 30_000 })
}

async function triviumShellTabs(page: Page): Promise<{ owner: string; tabIds: string[] }[]> {
  return page.evaluate((prefix) => {
    const tabsByWorktree = window.__store?.getState().tabsByWorktree ?? {}
    return Object.entries(tabsByWorktree)
      .filter(([owner, tabs]) => owner.startsWith(prefix) && tabs.length > 0)
      .map(([owner, tabs]) => ({ owner, tabIds: tabs.map((tab) => tab.id) }))
  }, SHELL_ID_PREFIX)
}

async function panelPtyId(page: Page): Promise<string> {
  const panel = page.locator('[data-trivium-terminal-panel]')
  await expect(panel.locator('[data-pty-id]')).toHaveCount(1, { timeout: 30_000 })
  const ptyId = await panel.locator('[data-pty-id]').getAttribute('data-pty-id')
  if (!ptyId) {
    throw new Error('The panel terminal has no PTY id')
  }
  return ptyId
}

async function hasPty(page: Page, ptyId: string): Promise<boolean | null> {
  return page.evaluate((id) => window.api.pty.hasPty(id), ptyId)
}

test('the Trivium terminal panel ends its shell on workspace change and page close', async ({
  electronApp,
  orcaPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await expectEveryWindowHidden(electronApp)
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await openTriviumPage(orcaPage)
  const header = orcaPage.locator('[data-trivium-header]')
  const toggle = header.getByRole('button', { name: 'Terminal' })
  // Available whatever the harness answered (this spec serves no fixture).
  await expect(toggle).toBeEnabled({ timeout: 30_000 })
  await toggle.click()
  const panel = orcaPage.locator('[data-trivium-terminal-panel]')
  await expect(panel).toBeVisible()
  const firstPty = await panelPtyId(orcaPage)
  expect(await triviumShellTabs(orcaPage)).toHaveLength(1)

  // Escape typed into the real xterm must not close the page.
  await panel.locator('.xterm').first().click()
  await orcaPage.keyboard.press('Escape')
  await orcaPage.waitForTimeout(300)
  await expect(header).toBeVisible()

  // Hiding moves focus out of the hidden panel.
  await panel.getByRole('button', { name: 'Hide terminal' }).click()
  await expect(panel).toBeHidden()
  await expect
    .poll(() =>
      orcaPage.evaluate(() => {
        const hidden = document.querySelector('[data-trivium-terminal-panel]')
        return Boolean(hidden && document.activeElement && hidden.contains(document.activeElement))
      })
    )
    .toBe(false)
  expect(await hasPty(orcaPage, firstPty)).toBe(true)

  // Switching workspace ends the first shell; the open panel starts one for the next workspace.
  await toggle.click()
  await expect(panel).toBeVisible()
  const current = await getActiveWorktreeId(orcaPage)
  const other = (await getAllWorktreeIds(orcaPage)).find((id) => id !== current)
  expect(other).toBeTruthy()
  await orcaPage.evaluate((id) => {
    const state = window.__store?.getState()
    if (!state || !id) {
      return
    }
    state.setActiveWorktree(id)
    // Keep the page on screen (the sidebar may route elsewhere); the page follows the workspace.
    state.openTriviumPage()
  }, other)
  await expect.poll(() => hasPty(orcaPage, firstPty), { timeout: 20_000 }).toBe(false)
  await expect
    .poll(async () => (await triviumShellTabs(orcaPage)).length, { timeout: 20_000 })
    .toBeLessThanOrEqual(1)
  // The page follows the workspace and the panel stays open, with a fresh shell at its root.
  await expect(panel).toBeVisible()
  const secondPty = await panelPtyId(orcaPage)
  expect(secondPty).not.toBe(firstPty)
  const otherPath = await orcaPage.evaluate(
    (id) =>
      Object.values(window.__store?.getState().worktreesByRepo ?? {})
        .flat()
        .find((entry) => entry.id === id)?.path ?? null,
    other
  )
  const shells = await triviumShellTabs(orcaPage)
  expect(shells).toEqual([
    { owner: `${SHELL_ID_PREFIX}::${otherPath}`, tabIds: [expect.any(String)] }
  ])

  // Closing the page ends the shell and leaves no ephemeral tab behind.
  await orcaPage.evaluate(() => window.__store?.getState().closeTriviumPage())
  await expect(header).toHaveCount(0)
  await expect.poll(async () => (await triviumShellTabs(orcaPage)).length).toBe(0)
  await expect.poll(() => hasPty(orcaPage, secondPty), { timeout: 20_000 }).toBe(false)
  await expectEveryWindowHidden(electronApp)
})
