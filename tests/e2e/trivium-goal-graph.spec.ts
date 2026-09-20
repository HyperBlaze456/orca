import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'
import { makeTriviumStatus } from '../../src/renderer/src/components/trivium/trivium-workspace-status.fixture'

test('inspects full goals and related records while retaining optional session drafts', async ({
  electronApp,
  orcaPage,
  testRepoPath
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(async () => {
    await window.__store?.getState().updateSettingsOrThrow({ uiLanguage: 'en' })
  })
  await attachRepoAndOpenTerminal(orcaPage, testRepoPath)
  const status = makeTriviumStatus()
  status.goals.nodes[0].statement = `${'Uploads finish or report why. '.repeat(12)}The final evidence is readable.`
  status.goals.nodes.push({
    id: 'goal.rejected',
    tier: 'g2',
    title: 'Rejected approach',
    statement: '',
    status: 'rejected'
  })
  status.goals.edges.push({
    id: 'rejected-edge',
    source: 'goal.rejected',
    target: 'goal.outcome',
    relation: 'contributes-to'
  })
  await electronApp.evaluate(({ ipcMain }, data) => {
    const handlers: unknown = Reflect.get(ipcMain, '_invokeHandlers')
    if (!(handlers instanceof Map)) {
      throw new Error('IPC handlers unavailable')
    }
    const original: unknown = handlers.get('runtime:call')
    if (typeof original !== 'function') {
      throw new Error('Runtime handler unavailable')
    }
    ipcMain.removeHandler('runtime:call')
    ipcMain.handle('runtime:call', (event, request: { method: string }) => {
      if (request.method === 'trivium.status') {
        return { ok: true, result: { ...data, supported: true, host: 'local' } }
      }
      if (request.method === 'trivium.tickets') {
        return {
          ok: true,
          result: {
            supported: true,
            host: 'local',
            tickets: [
              {
                id: 'ticket.inspect',
                title: 'Inspect upload evidence',
                statement: 'Full ticket content from the execution host.',
                state: 'done',
                evidence: [{ summary: 'Retry test passed.' }]
              }
            ]
          }
        }
      }
      if (request.method === 'trivium.progress') {
        return {
          ok: true,
          result: {
            supported: true,
            host: 'local',
            campaigns: [
              {
                campaign_id: 'campaign.inspect',
                phase: 'active',
                features: [
                  { feature_id: 'feature.inspect', summary: 'Detailed verification is available.' }
                ]
              }
            ],
            conflicts: []
          }
        }
      }
      return original(event, request)
    })
  }, status)
  await orcaPage.evaluate(() => window.__store?.getState().openTriviumPage())
  const graph = orcaPage.locator('.trivium-goal-graph')
  await expect(graph.locator('.react-flow__node')).toHaveCount(2)
  await expect(graph.locator('.react-flow__edge')).toHaveCount(1)
  await expect(graph.locator('.react-flow__edge-text')).toHaveCount(0)
  await expect(orcaPage.getByText('2 / 3 goals', { exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveText('100%')
  const node = graph.getByLabel('G0: Ship uploads that survive flaky networks', { exact: true })
  const outcome = graph.getByLabel('G1: Resume interrupted uploads', { exact: true })
  const purposeBounds = await node.boundingBox()
  const outcomeBounds = await outcome.boundingBox()
  if (!purposeBounds || !outcomeBounds) {
    throw new Error('Graph nodes are not rendered')
  }
  expect(outcomeBounds.y).toBeGreaterThan(purposeBounds.y + purposeBounds.height)
  expect(outcomeBounds.x).toBe(purposeBounds.x)
  const connectionBounds = await node.locator('[data-handleid="contribution-target"]').boundingBox()
  if (!connectionBounds) {
    throw new Error('Contribution connection is not rendered')
  }
  expect(connectionBounds.y + connectionBounds.height / 2).toBeCloseTo(
    purposeBounds.y + purposeBounds.height,
    0
  )
  await expect(node.locator('.trivium-goal-title')).toHaveCSS('font-size', '16px')
  await orcaPage.getByRole('combobox', { name: 'Text size', exact: true }).click()
  await orcaPage.getByRole('option', { name: 'Large', exact: true }).click()
  await expect(node.locator('.trivium-goal-title')).toHaveCSS('font-size', '18px')
  await orcaPage.getByRole('combobox', { name: 'Show', exact: true }).click()
  await orcaPage.getByRole('option', { name: 'All goals', exact: true }).click()
  await expect(graph.locator('.react-flow__node')).toHaveCount(3)
  await expect(graph.locator('.react-flow__edge')).toHaveCount(2)
  await orcaPage.getByRole('combobox', { name: 'Show', exact: true }).click()
  await orcaPage.getByRole('option', { name: 'Candidate', exact: true }).click()
  await expect(orcaPage.getByText('No goals match this filter.', { exact: true })).toBeVisible()
  await orcaPage.getByRole('button', { name: 'All goals', exact: true }).click()
  await expect(graph.locator('.react-flow__node')).toHaveCount(3)
  await node.click()
  const details = orcaPage.getByRole('region', { name: 'Goal details', exact: true })
  await expect(details.getByText(status.goals.nodes[0].statement, { exact: true })).toBeVisible()
  await expect(details.getByText(status.goals.nodes[0].statement, { exact: true })).toHaveCSS(
    '-webkit-line-clamp',
    'none'
  )
  await details.getByRole('button', { name: /Resume interrupted uploads/ }).click()
  await expect(
    details.getByRole('heading', { name: 'Resume interrupted uploads', exact: true })
  ).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Previous goal', exact: true }).click()
  await expect(
    details.getByRole('heading', { name: 'Ship uploads that survive flaky networks', exact: true })
  ).toBeVisible()
  await details.getByRole('button', { name: 'Browse tickets under this goal' }).click()
  const tickets = orcaPage.getByRole('region', { name: 'Ticket details', exact: true })
  await expect(
    tickets.getByText('Full ticket content from the execution host.', { exact: true })
  ).toBeVisible()
  await tickets.getByRole('button', { name: 'Evidence 1', exact: true }).click()
  await tickets.getByRole('button', { name: 'Retry test passed.', exact: true }).click()
  await expect(tickets.getByText('Retry test passed.', { exact: true })).toHaveCount(2)
  await orcaPage.getByRole('tab', { name: 'Progress details', exact: true }).click()
  const progress = orcaPage.getByRole('region', { name: 'Progress details', exact: true })
  await progress.getByRole('button', { name: 'campaign.inspect', exact: true }).click()
  await progress.getByRole('button', { name: 'Features 1', exact: true }).click()
  await progress
    .getByRole('button', { name: 'Detailed verification is available.', exact: true })
    .click()
  await expect(
    progress.getByText('Detailed verification is available.', { exact: true })
  ).toHaveCount(2)
  await orcaPage.getByRole('tab', { name: 'Goal list', exact: true }).click()
  await orcaPage
    .getByRole('textbox', { name: 'Search goals', exact: true })
    .fill('Rejected approach')
  await orcaPage.getByRole('button', { name: /Rejected approach/ }).click()
  await expect(
    details.getByRole('heading', { name: 'Rejected approach', exact: true })
  ).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Goal graph', exact: true }).click()
  await details.getByRole('button', { name: /Resume interrupted uploads/ }).click()
  await details.getByRole('button', { name: /Ship uploads that survive flaky networks/ }).click()
  for (const theme of ['light', 'dark'] as const) {
    await orcaPage.evaluate(async (theme) => {
      await window.__store?.getState().updateSettingsOrThrow({ theme })
    }, theme)
    await expect(orcaPage.locator('html')).toHaveClass(new RegExp(theme))
    await orcaPage.screenshot({ path: testInfo.outputPath(`trivium-inspect-${theme}.png`) })
  }
  await orcaPage.getByRole('tab', { name: 'Session', exact: true }).click()
  const session = orcaPage.getByRole('region', { name: 'Session' })
  await expect(session.getByText('goal.purpose', { exact: true })).toBeVisible()
  await session.getByLabel('What should change?').fill('Make the retry policy explicit.')
  await graph.getByLabel('G1: Resume interrupted uploads', { exact: true }).focus()
  await orcaPage.keyboard.press('Enter')
  await orcaPage.getByRole('tab', { name: 'Session', exact: true }).click()
  await expect(session.getByText('goal.outcome', { exact: true })).toBeVisible()
  await expect(session.getByLabel('What should change?')).toHaveValue(
    'Make the retry policy explicit.'
  )
  await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    const state = store.getState()
    const workspaceId = state.activeWorktreeId
    const tabId = workspaceId ? state.activeTabIdByWorktree[workspaceId] : undefined
    const leafId = tabId ? state.terminalLayoutsByTabId[tabId]?.activeLeafId : undefined
    if (!tabId || !leafId) {
      throw new Error('Fixture terminal unavailable')
    }
    // Only advertise the fixture shell in the picker; no agent or prompt is launched.
    const paneKey = `${tabId}:${leafId}`
    store.setState({
      agentStatusByPaneKey: {
        ...state.agentStatusByPaneKey,
        [paneKey]: {
          paneKey,
          state: 'done',
          prompt: '',
          updatedAt: Date.now(),
          stateStartedAt: Date.now(),
          agentType: 'codex',
          stateHistory: []
        }
      }
    })
  })
  await expect(session.locator('.xterm-screen')).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await orcaPage.evaluate(async (theme) => {
      await window.__store?.getState().updateSettingsOrThrow({ theme })
    }, theme)
    await expect(orcaPage.locator('html')).toHaveClass(new RegExp(theme))
    await orcaPage.screenshot({ path: testInfo.outputPath(`trivium-graph-${theme}.png`) })
  }
  await orcaPage.getByRole('tab', { name: 'Workspace details' }).click()
  await expect(
    orcaPage.getByText('trivium model ticket approve ticket.upload-retry', { exact: true })
  ).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Goal graph' }).click()
  await orcaPage.evaluate(() => window.__store?.getState().closeTriviumPage())
  await orcaPage.evaluate(() => window.__store?.getState().openTriviumPage())
  await orcaPage.getByRole('tab', { name: 'Session', exact: true }).click()
  await expect(orcaPage.getByRole('combobox', { name: 'Text size', exact: true })).toHaveText(
    'Large'
  )
  await expect(orcaPage.getByRole('combobox', { name: 'Show', exact: true })).toHaveText(
    'All goals'
  )
  await expect(session.getByLabel('What should change?')).toHaveValue(
    'Make the retry policy explicit.'
  )
  await expect(session.getByText('goal.outcome', { exact: true })).toBeVisible()
})
