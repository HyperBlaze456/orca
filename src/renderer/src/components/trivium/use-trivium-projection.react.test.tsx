// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { useTriviumProjection } from './use-trivium-projection'

const { call, supports } = vi.hoisted(() => ({ call: vi.fn(), supports: vi.fn(async () => true) }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: call,
  runtimeEnvironmentSupportsCapability: supports
}))

beforeEach(() => {
  call.mockReset()
  supports.mockReset().mockResolvedValue(true)
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(cleanup)

describe('Trivium read-only details', () => {
  it('requests all ticket states, including completed tickets, under the selected goal', async () => {
    call.mockResolvedValue({ supported: true, tickets: [{ id: 'ticket.1', state: 'done' }] })
    const { result } = renderHook(() =>
      useTriviumProjection('folder:notes', { kind: 'tickets', under: 'goal.1' })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(call).toHaveBeenCalledWith(
      { kind: 'local' },
      'trivium.tickets',
      { worktree: 'id:folder:notes', under: 'goal.1', state: 'all', status: 'all' },
      expect.objectContaining({ timeoutMs: 20_000 })
    )
    expect(result.current.data?.tickets).toEqual([{ id: 'ticket.1', state: 'done' }])
  })

  it('discards a slow answer after the user switches workspace', async () => {
    let finishFirst: (value: unknown) => void = () => {}
    call
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve
          })
      )
      .mockResolvedValueOnce({ supported: true, campaigns: [{ campaign_id: 'new-workspace' }] })
    const { result, rerender } = renderHook(
      ({ id }) => useTriviumProjection(id, { kind: 'progress' }),
      { initialProps: { id: 'old' } }
    )
    rerender({ id: 'new' })
    await waitFor(() =>
      expect(result.current.data?.campaigns).toEqual([{ campaign_id: 'new-workspace' }])
    )
    await act(async () => {
      finishFirst({ supported: true, campaigns: [{ campaign_id: 'old-workspace' }] })
    })
    expect(result.current.data?.campaigns).toEqual([{ campaign_id: 'new-workspace' }])
  })

  it('reports service refusal and permits retry without presenting it as an empty list', async () => {
    call
      .mockResolvedValueOnce({
        supported: true,
        serviceError: { code: 'unsupported', message: 'Update the host to read these details.' }
      })
      .mockResolvedValueOnce({ supported: true, tickets: [] })
    const { result } = renderHook(() => useTriviumProjection('workspace', { kind: 'tickets' }))
    await waitFor(() => expect(result.current.error).toBe('Update the host to read these details.'))
    expect(result.current.data).toBeUndefined()
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.data?.tickets).toEqual([]))
    expect(result.current.error).toBeUndefined()
  })
})
