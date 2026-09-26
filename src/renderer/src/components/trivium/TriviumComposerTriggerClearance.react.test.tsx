// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useAppStore } from '@/store'
import { G2 } from './trivium-model-tables.fixture'
import { renderWithTooltips, requireElement } from './trivium-reader-test-harness'
import { makeReaderFixture } from './trivium-reader-model.fixture'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumComposer } from './TriviumComposer'

// The floating-terminal trigger sits 24px + 36px from the right edge, level with Send.
const CLEARANCE = 'pr-[72px]'
const { model } = makeReaderFixture()

function settings(patch: Partial<GlobalSettings>): GlobalSettings {
  return { ...getDefaultSettings('/tmp'), ...patch }
}

function renderComposer(): HTMLElement {
  renderWithTooltips(
    <TriviumComposer
      model={model}
      itemId={G2}
      workspaceId="wt"
      sessionKey="wt"
      inputRef={createRef<HTMLTextAreaElement>()}
    />
  )
  return requireElement(document.querySelector('[data-trivium-composer]'))
}

beforeEach(() => {
  useTriviumSessionState.setState({ sessions: {} })
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(cleanup)

describe('TriviumComposer beside the floating-terminal trigger', () => {
  it('clears the trigger at its default spot', () => {
    useAppStore.setState({ settings: settings({}), statusBarVisible: true })
    expect(renderComposer()).toHaveClass(CLEARANCE)
  })

  it('keeps its own padding when the floating terminal is disabled', () => {
    useAppStore.setState({
      settings: settings({ floatingTerminalEnabled: false }),
      statusBarVisible: true
    })
    const wrapper = renderComposer()
    expect(wrapper).not.toHaveClass(CLEARANCE)
    expect(wrapper).toHaveClass('px-4')
  })

  it('keeps its own padding while settings are still loading', () => {
    useAppStore.setState({ settings: null, statusBarVisible: true })
    expect(renderComposer()).not.toHaveClass(CLEARANCE)
  })

  it('follows the trigger into and out of the status bar', async () => {
    useAppStore.setState({
      settings: settings({ floatingTerminalTriggerLocation: 'status-bar' }),
      statusBarVisible: true
    })
    const wrapper = renderComposer()
    expect(wrapper).not.toHaveClass(CLEARANCE)

    // Hiding the status bar brings the trigger back as a floating button.
    await act(async () => useAppStore.setState({ statusBarVisible: false }))
    expect(wrapper).toHaveClass(CLEARANCE)
  })
})
