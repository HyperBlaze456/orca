// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import { i18n } from '../../i18n/i18n'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  openTaskPage: vi.fn(),
  openAutomationsPage: vi.fn(),
  openActivityPage: vi.fn(),
  openMobilePage: vi.fn(),
  openArtifactsPage: vi.fn(),
  openTriviumPage: vi.fn(),
  openModal: vi.fn(),
  updateSettings: vi.fn(),
  refreshPreflightStatus: vi.fn(),
  checkLinearConnection: vi.fn(),
  hasPairedMobileDevice: false,
  agentBucketCounts: { attention: 0, working: 0, done: 0, idle: 0 },
  getAgentBucketCounts: vi.fn(),
  dismissMobileOnboardingBadge: vi.fn(),
  setSetupGuideSidebarDismissed: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/activity/useActivityUnreadCount', () => ({
  useActivityUnreadCount: () => 0
}))

vi.mock('@/components/dashboard/useAgentBucketCounts', () => ({
  useAgentBucketCounts: () => {
    mocks.getAgentBucketCounts()
    return mocks.agentBucketCounts
  }
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyComboDetails: () => [{ keys: ['⌘', 'J'], doubleTap: false }]
}))

vi.mock('./mobile-sidebar-onboarding-badge', () => ({
  useMobileSidebarOnboardingBadge: () => ({
    visible: false,
    hasPairedDevice: mocks.hasPairedMobileDevice,
    dismiss: mocks.dismissMobileOnboardingBadge
  })
}))

vi.mock('../setup-guide/use-setup-guide-progress', () => ({
  useSetupGuideProgress: () => ({
    ready: true,
    coreDoneCount: 0,
    coreTotal: 1,
    stepDone: {}
  })
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="context-menu">{children}</div>
  ),
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="context-menu-content">{children}</div>
  ),
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  )
}))

import SidebarNav, { shouldShowTriviumButton } from './SidebarNav'

function gitRepo(): Repo {
  return {
    id: 'repo-1',
    path: '/tmp/repo-1',
    displayName: 'repo-1',
    badgeColor: 'gray',
    addedAt: 1,
    kind: 'git'
  }
}

function setSidebarState({
  settings = getDefaultSettings('/tmp'),
  repos = [gitRepo()]
}: {
  settings?: GlobalSettings
  repos?: Repo[]
} = {}): void {
  mocks.state = {
    settings,
    repos,
    activeView: 'worktrees',
    openTaskPage: mocks.openTaskPage,
    openAutomationsPage: mocks.openAutomationsPage,
    openActivityPage: mocks.openActivityPage,
    openMobilePage: mocks.openMobilePage,
    openArtifactsPage: mocks.openArtifactsPage,
    openTriviumPage: mocks.openTriviumPage,
    openModal: mocks.openModal,
    updateSettings: mocks.updateSettings,
    preflightStatus: { glab: { installed: false } },
    preflightStatusChecked: true,
    refreshPreflightStatus: mocks.refreshPreflightStatus,
    linearStatus: { connected: false },
    linearStatusChecked: true,
    checkLinearConnection: mocks.checkLinearConnection,
    prefetchWorkItems: vi.fn(),
    activeRepoId: null,
    persistedUIReady: true,
    activeModal: null,
    setupGuideSidebarDismissed: true,
    setSetupGuideSidebarDismissed: mocks.setSetupGuideSidebarDismissed
  }
}

const mountedRoots: Root[] = []

async function renderSidebarNav(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <SidebarNav />
      </TooltipProvider>
    )
  })
  return container
}

function queryButtonByText(container: ParentNode, text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === text
    ) ?? null
  )
}

function getButtonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = queryButtonByText(container, text)
  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }
  return button
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('SidebarNav Trivium entry', () => {
  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    mocks.hasPairedMobileDevice = false
    mocks.agentBucketCounts = { attention: 0, working: 0, done: 0, idle: 0 }
    setSidebarState()
  })

  it('shows the Trivium entry by default and hides it only when switched off', () => {
    expect(shouldShowTriviumButton(null)).toBe(true)
    expect(shouldShowTriviumButton({})).toBe(true)
    expect(shouldShowTriviumButton({ showTriviumButton: true })).toBe(true)
    expect(shouldShowTriviumButton({ showTriviumButton: false })).toBe(false)
  })

  it('opens Trivium from the sidebar', async () => {
    setSidebarState({ settings: getDefaultSettings('/tmp') })
    const container = await renderSidebarNav()

    await clickButton(getButtonByText(container, 'Trivium'))

    expect(mocks.openTriviumPage).toHaveBeenCalledOnce()
  })
})
