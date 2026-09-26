/**
 * The rebuilt Trivium page end to end, against WO-1a's real-shaped harness fixture.
 *
 * The main process's `runtime:call` handler answers the three `trivium.*` reads from the
 * fixture (repo HEAD payloads, then the installed 0.15 binary's), so the spec drives the real
 * renderer: a second visit's change markers, Overview, a Goal chosen in the tree, a ticket and
 * its pager, All tickets with a Display change, back to the Overview, workspace details, a lost
 * host (stale notice), and a workspace without a harness. Every window stays hidden;
 * screenshots come from CDP.
 */

import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import type { TriviumWorkspaceStatus } from '../../src/shared/trivium-workspace-status'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import {
  makeTriviumModelStatus,
  makeTriviumModelTicketRecords
} from '../../src/renderer/src/components/trivium/trivium-model-graph.fixture'
import { makeTriviumModelProgress } from '../../src/renderer/src/components/trivium/trivium-model-progress.fixture'
import {
  FIXTURE_GOALS,
  G2,
  type TriviumFixtureBinary
} from '../../src/renderer/src/components/trivium/trivium-model-tables.fixture'

/** `earlier` is the harness as an earlier visit saw it; `online` is the current one. */
type TriviumScenario = 'earlier' | 'online' | 'offline' | 'no-harness'

type TriviumRuntimeFixture = {
  status: TriviumWorkspaceStatus
  earlierStatus: TriviumWorkspaceStatus
  noHarnessStatus: TriviumWorkspaceStatus
  tickets: Record<string, unknown>[]
  earlierTickets: Record<string, unknown>[]
  progress: Record<string, unknown>
}

const CANDIDATE_TICKET = 'ticket.trim-keeps-marker'
/** Added since the earlier visit. */
const LATER_TICKET = 'ticket.search-overlap-check'
/** Retitled since the earlier visit. */
const RENAMED_TICKET = 'ticket.sync-export'
const G2_TITLE = FIXTURE_GOALS.find((goal) => goal.id === G2)?.title ?? G2

function earlierVisit(status: TriviumWorkspaceStatus): TriviumWorkspaceStatus {
  return {
    ...status,
    goals: {
      ...status.goals,
      nodes: status.goals.nodes
        .filter((node) => node.id !== LATER_TICKET)
        .map((node) =>
          node.id === RENAMED_TICKET ? { ...node, title: 'Exported notebooks open anywhere' } : node
        ),
      edges: status.goals.edges.filter(
        (edge) => edge.source !== LATER_TICKET && edge.target !== LATER_TICKET
      )
    }
  }
}

function runtimeFixture(binary: TriviumFixtureBinary): TriviumRuntimeFixture {
  const status = makeTriviumModelStatus()
  const tickets = makeTriviumModelTicketRecords(binary)
  return {
    status,
    earlierStatus: earlierVisit(status),
    noHarnessStatus: { ...status, state: 'no-harness', harness_root: null },
    tickets,
    earlierTickets: tickets.filter((ticket) => ticket.id !== LATER_TICKET),
    progress: makeTriviumModelProgress(binary)
  }
}

/**
 * Answers `trivium.*` from the fixture and passes every other runtime call through. The
 * scenario lives in the main process's env so the spec can take the host offline mid-run.
 */
async function serveTriviumFixture(
  app: ElectronApplication,
  fixture: TriviumRuntimeFixture
): Promise<void> {
  await app.evaluate(({ ipcMain }, payloads: TriviumRuntimeFixture) => {
    // Electron keeps invoke handlers in a private map; read it through a checked accessor.
    const registry: unknown = '_invokeHandlers' in ipcMain ? ipcMain._invokeHandlers : null
    if (!(registry instanceof Map)) {
      throw new Error('ipcMain invoke handlers are unavailable')
    }
    const original: unknown = registry.get('runtime:call')
    if (typeof original !== 'function') {
      throw new Error('runtime:call has no handler to wrap')
    }
    ipcMain.removeHandler('runtime:call')
    ipcMain.handle('runtime:call', async (event, request: { method: string }) => {
      if (!request.method.startsWith('trivium.')) {
        return original(event, request)
      }
      const scenario = process.env.ORCA_E2E_TRIVIUM_SCENARIO ?? 'online'
      if (scenario === 'offline') {
        throw new Error('Execution host is unreachable.')
      }
      const envelope = { supported: true, host: 'local' }
      const status =
        scenario === 'no-harness'
          ? payloads.noHarnessStatus
          : scenario === 'earlier'
            ? payloads.earlierStatus
            : payloads.status
      const tickets = scenario === 'earlier' ? payloads.earlierTickets : payloads.tickets
      switch (request.method) {
        case 'trivium.status':
          return { ok: true, result: { ...status, ...envelope } }
        case 'trivium.tickets':
          return { ok: true, result: { ...envelope, tickets } }
        case 'trivium.progress':
          return { ok: true, result: { ...envelope, ...payloads.progress } }
        default:
          return original(event, request)
      }
    })
  }, fixture)
}

async function setScenario(app: ElectronApplication, scenario: TriviumScenario): Promise<void> {
  await app.evaluate((_electron, next: TriviumScenario) => {
    process.env.ORCA_E2E_TRIVIUM_SCENARIO = next
  }, scenario)
}

async function expectEveryWindowHidden(app: ElectronApplication): Promise<void> {
  const visibility = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.isVisible())
  )
  expect(visibility.length).toBeGreaterThan(0)
  expect(visibility.every((visible) => !visible)).toBe(true)
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(
    async (value) => window.__store?.getState().updateSettingsOrThrow({ theme: value }),
    theme
  )
  const html = page.locator('html')
  await (theme === 'dark' ? expect(html).toHaveClass(/dark/) : expect(html).not.toHaveClass(/dark/))
}

/** Light and dark CDP captures of the hidden window, with the pointer parked off the page. */
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.mouse.move(0, 0)
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`trivium-${name}-${theme}.png`)
    })
  }
}

async function openTriviumPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    await window.__store?.getState().updateSettingsOrThrow({ uiLanguage: 'en' })
    window.__store?.getState().openTriviumPage()
  })
  await expect(page.locator('[data-trivium-header]')).toBeVisible({ timeout: 30_000 })
}

/** A first visit marks nothing and, on leaving, remembers what it saw. */
async function visitEarlierHarness(app: ElectronApplication, page: Page): Promise<void> {
  await setScenario(app, 'earlier')
  await openTriviumPage(page)
  await expect(page.getByRole('tree', { name: 'Goals and tickets' })).toBeVisible()
  await expect(page.locator('[data-trivium-changes]')).toHaveCount(0)
  await page.evaluate(() => window.__store?.getState().closeTriviumPage())
  await expect(page.locator('[data-trivium-header]')).toHaveCount(0)
  await setScenario(app, 'online')
}

/** The header chip lists what changed since that visit; Mark as seen clears it. */
async function reviewChanges(page: Page, testInfo: TestInfo, binary: string): Promise<void> {
  const chip = page.locator('[data-trivium-header] [data-trivium-changes]')
  await expect(chip).toHaveText('1 new · 1 changed')
  await chip.click()
  const changes = page.getByRole('dialog', { name: 'Changes since your last visit' })
  await expect(changes.locator(`[data-trivium-change-item="${LATER_TICKET}"]`)).toBeVisible()
  await expect(changes.locator(`[data-trivium-change-item="${RENAMED_TICKET}"]`)).toContainText(
    'Title changed'
  )
  await capture(page, testInfo, `${binary}-changes`)
  await changes.getByRole('button', { name: 'Mark as seen' }).click()
  await expect(chip).toHaveCount(0)
}

/** Overview → Goal from the tree → ticket and its pager → All tickets → Overview again. */
async function walkThePage(
  page: Page,
  testInfo: TestInfo,
  binary: TriviumFixtureBinary
): Promise<void> {
  const header = page.locator('[data-trivium-header]')
  const reader = page.locator('[data-trivium-reader]')
  const tree = page.getByRole('tree', { name: 'Goals and tickets' })
  const views = page.getByRole('navigation', { name: 'Trivium views' })

  await expect(header.locator('[data-trivium-state="review"]')).toHaveText(
    'Milestone ready for review'
  )
  await expect(reader.locator('[data-trivium-page="overview"]')).toBeVisible()
  await expect(reader.locator('[data-trivium-section="campaigns"]')).toBeVisible()
  await expect(reader.locator('[data-trivium-pending]')).toHaveCount(0)
  // The sidebar's one-time relocation hint would cover the screenshots; it closes after 12s.
  await expect(page.getByText('Workspace board moved to the bottom bar')).toHaveCount(0, {
    timeout: 20_000
  })
  await capture(page, testInfo, `${binary}-overview`)

  await tree.getByText(G2_TITLE, { exact: true }).click()
  const goal = reader.locator(`[data-trivium-page="goal"][data-trivium-item="${G2}"]`)
  await expect(goal).toBeVisible()
  await expect(tree.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1)
  await capture(page, testInfo, `${binary}-goal`)

  await goal.locator(`[data-trivium-ticket-row="${CANDIDATE_TICKET}"]`).click()
  const ticket = reader.locator(
    `[data-trivium-page="ticket"][data-trivium-item="${CANDIDATE_TICKET}"]`
  )
  await expect(ticket).toBeVisible()
  await expect(ticket.locator('[data-trivium-approval]')).toBeVisible()
  const pager = ticket.locator('[data-trivium-pager]')
  await expect(pager).toContainText(/^\d+ \/ 10/)
  const position = Number.parseInt((await pager.textContent()) ?? '', 10)
  await capture(page, testInfo, `${binary}-ticket`)
  const step = position < 10 ? 'Next ticket' : 'Previous ticket'
  await pager.getByRole('button', { name: step }).click()
  await expect(reader.locator('[data-trivium-pager]')).toContainText(
    `${step === 'Next ticket' ? position + 1 : position - 1} / 10`
  )

  await views.getByRole('button', { name: /^All tickets/ }).click()
  const list = reader.locator('[data-trivium-page="tickets"]')
  await expect(list).toBeVisible()
  await expect(list.locator('[data-trivium-ticket-row]')).toHaveCount(14)
  await capture(page, testInfo, `${binary}-tickets`)
  await list.getByRole('button', { name: 'Display' }).click()
  await page
    .getByRole('dialog', { name: 'Display options' })
    .getByRole('radio', { name: 'Goal', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(list.locator('[data-trivium-group^="goal:"]').first()).toBeVisible()
  await expect(list.locator('[data-trivium-group^="status:"]')).toHaveCount(0)

  await views.getByRole('button', { name: /^Overview/ }).click()
  await expect(reader.locator('[data-trivium-page="overview"]')).toBeVisible()
  await expect(views.getByRole('button', { name: /^Overview/ })).toHaveAttribute(
    'aria-current',
    'page'
  )
}

for (const binary of ['head', 'installed'] as const) {
  test(`reads the ${binary} harness through the Trivium page with every window hidden`, async ({
    electronApp,
    orcaPage
  }, testInfo) => {
    test.setTimeout(240_000)
    await waitForSessionReady(orcaPage)
    await expectEveryWindowHidden(electronApp)
    await serveTriviumFixture(electronApp, runtimeFixture(binary))
    await orcaPage.setViewportSize({ width: 1440, height: 900 })
    await visitEarlierHarness(electronApp, orcaPage)
    await openTriviumPage(orcaPage)

    await walkThePage(orcaPage, testInfo, binary)
    await reviewChanges(orcaPage, testInfo, binary)

    if (binary === 'head') {
      const header = orcaPage.locator('[data-trivium-header]')
      await header.getByRole('button', { name: 'Workspace details' }).click()
      const details = orcaPage.getByRole('dialog', { name: 'Workspace details' })
      await expect(details).toContainText('/srv/notes')
      await expect(details).toContainText('6 Campaigns · 21 features · 22 publications')
      await capture(orcaPage, testInfo, 'head-details')
      await orcaPage.keyboard.press('Escape')
      await expect(details).toHaveCount(0)

      const stale = header.locator('[data-trivium-stale]')
      await setScenario(electronApp, 'offline')
      await header.getByRole('button', { name: 'Refresh' }).click()
      await expect(stale).toContainText(/Can't reach Trivium\. Showing data from \d{2}:\d{2}\./)
      await expect(stale).not.toContainText(/ended/i)
      await expect(orcaPage.getByRole('tree', { name: 'Goals and tickets' })).toBeVisible()
      await expect(orcaPage.locator('[data-trivium-page="overview"]')).toBeVisible()
      await capture(orcaPage, testInfo, 'head-stale')
      await setScenario(electronApp, 'online')
      await stale.getByRole('button', { name: 'Retry' }).click()
      await expect(stale).toHaveCount(0)

      await setScenario(electronApp, 'no-harness')
      await header.getByRole('button', { name: 'Refresh' }).click()
      const noHarness = orcaPage.locator('[data-trivium-screen="no-harness"]')
      await expect(noHarness).toContainText('This workspace has no Trivium harness')
      await expect(header.locator('[data-trivium-state="no-harness"]')).toHaveText(
        'Not set up in this workspace'
      )
      await expect(noHarness.getByRole('button', { name: 'Copy command' })).toBeVisible()
      await expect(orcaPage.getByRole('tree')).toHaveCount(0)
      await capture(orcaPage, testInfo, 'head-no-harness')
    }

    await expectEveryWindowHidden(electronApp)
  })
}
