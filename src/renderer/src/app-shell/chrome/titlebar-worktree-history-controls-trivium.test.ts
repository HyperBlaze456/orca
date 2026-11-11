import { describe, expect, it } from 'vitest'
import { shouldShowWorktreeHistoryControls } from './titlebar-worktree-history-controls'

describe('shouldShowWorktreeHistoryControls on the Trivium page', () => {
  it('shows controls because Trivium joins the worktree history stack', () => {
    expect(shouldShowWorktreeHistoryControls('trivium')).toBe(true)
  })
})
