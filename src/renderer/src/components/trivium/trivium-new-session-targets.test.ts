import { describe, expect, it } from 'vitest'
import {
  buildTriviumComposerTargetItems,
  buildTriviumNewSessionGroup,
  findTriviumNewSessionAgent,
  pickTriviumDefaultSessionTarget,
  resolveTriviumNewSessionChoice,
  triviumNewSessionKey,
  type TriviumNewSessionGroup
} from './trivium-new-session-targets'
import { triviumSessionTargetKey } from './trivium-session-state'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'
const SESSIONS = [
  { tabId: 'tab-b', leafId: LEAF_B, ptyId: 'pty-b', tabTitle: 'Codex session' },
  { tabId: 'tab-a', leafId: LEAF_A, ptyId: 'pty-a', tabTitle: 'Claude session' }
]

function group(
  detectedIds: Parameters<typeof buildTriviumNewSessionGroup>[0]['detectedIds'],
  extra: Partial<Parameters<typeof buildTriviumNewSessionGroup>[0]> = {}
): TriviumNewSessionGroup {
  return buildTriviumNewSessionGroup({
    detectedIds,
    defaultAgent: null,
    disabledAgents: [],
    ...extra
  })
}

function agentsOf(value: TriviumNewSessionGroup): string[] {
  return value.state === 'ready' ? value.agents.map((option) => option.agent) : []
}

describe('Trivium composer new-session group', () => {
  it('lists detected agents in catalog order with their catalog labels', () => {
    const result = group(['opencode', 'codex', 'claude'])
    expect(result).toEqual({
      state: 'ready',
      agents: [
        { agent: 'claude', label: 'Claude', key: 'new:claude' },
        { agent: 'codex', label: 'Codex', key: 'new:codex' },
        { agent: 'opencode', label: 'OpenCode', key: 'new:opencode' }
      ]
    })
  })

  it('puts the default agent first', () => {
    expect(agentsOf(group(['claude', 'codex', 'opencode'], { defaultAgent: 'codex' }))).toEqual([
      'codex',
      'claude',
      'opencode'
    ])
  })

  it('ignores a default that is blank, undetected or disabled', () => {
    expect(agentsOf(group(['codex', 'claude'], { defaultAgent: 'blank' }))).toEqual([
      'claude',
      'codex'
    ])
    expect(agentsOf(group(['codex', 'claude'], { defaultAgent: 'opencode' }))).toEqual([
      'claude',
      'codex'
    ])
    expect(
      agentsOf(group(['codex', 'claude'], { defaultAgent: 'codex', disabledAgents: ['codex'] }))
    ).toEqual(['claude'])
  })

  it('filters out disabled agents', () => {
    expect(agentsOf(group(['claude', 'codex'], { disabledAgents: ['claude'] }))).toEqual(['codex'])
  })

  it('is detecting while detection has no answer, and empty when none are usable', () => {
    expect(group(null)).toEqual({ state: 'detecting' })
    expect(group(null, { detectionFailed: true })).toEqual({ state: 'none' })
    expect(group([])).toEqual({ state: 'none' })
    expect(group(['claude'], { disabledAgents: ['claude'] })).toEqual({ state: 'none' })
  })
})

describe('Trivium composer target list', () => {
  it('keeps existing sessions first and unchanged, then the new-session group', () => {
    const items = buildTriviumComposerTargetItems(
      SESSIONS,
      group(['codex', 'claude'], { defaultAgent: 'codex' })
    )
    expect(items.sessions).toEqual([
      { key: triviumSessionTargetKey(SESSIONS[0]), label: 'Codex session' },
      { key: triviumSessionTargetKey(SESSIONS[1]), label: 'Claude session' }
    ])
    expect(items.newSession).toEqual([
      { kind: 'agent', agent: 'codex', label: 'Codex', key: 'new:codex' },
      { kind: 'agent', agent: 'claude', label: 'Claude', key: 'new:claude' }
    ])
  })

  it('shows one status entry while detecting or when no agent is usable', () => {
    expect(buildTriviumComposerTargetItems([], group(null)).newSession).toEqual([
      { kind: 'detecting', key: 'new-status:detecting' }
    ])
    expect(buildTriviumComposerTargetItems(SESSIONS, group([])).newSession).toEqual([
      { kind: 'none', key: 'new-status:none' }
    ])
  })

  it('never confuses a session key, a status key and a new-session key', () => {
    const ready = group(['claude'])
    expect(findTriviumNewSessionAgent(ready, 'new:claude')?.agent).toBe('claude')
    expect(findTriviumNewSessionAgent(ready, triviumSessionTargetKey(SESSIONS[1]))).toBeUndefined()
    expect(findTriviumNewSessionAgent(ready, 'new-status:detecting')).toBeUndefined()
    expect(findTriviumNewSessionAgent(group(null), triviumNewSessionKey('claude'))).toBeUndefined()
  })
})

describe('Trivium composer default choice', () => {
  const ready = group(['claude', 'codex'], { defaultAgent: 'codex' })

  it('preselects the default agent when the workspace has no session', () => {
    expect(
      resolveTriviumNewSessionChoice({ chosen: null, hasSessions: false, group: ready })?.agent
    ).toBe('codex')
  })

  it('preselects the first detected agent when there is no usable default', () => {
    expect(
      resolveTriviumNewSessionChoice({
        chosen: null,
        hasSessions: false,
        group: group(['codex', 'claude'])
      })?.agent
    ).toBe('claude')
  })

  it('keeps existing sessions as the default when there are any', () => {
    expect(resolveTriviumNewSessionChoice({ chosen: null, hasSessions: true, group: ready })).toBe(
      null
    )
    expect(pickTriviumDefaultSessionTarget(SESSIONS, 'tab-a', LEAF_A)).toBe(SESSIONS[1])
    expect(pickTriviumDefaultSessionTarget(SESSIONS, 'tab-a', LEAF_B)).toBe(SESSIONS[0])
    expect(pickTriviumDefaultSessionTarget(SESSIONS, undefined, null)).toBe(SESSIONS[0])
    expect(pickTriviumDefaultSessionTarget([], 'tab-a', LEAF_A)).toBeUndefined()
  })

  it('honours a picked agent while it is offered, with or without sessions', () => {
    expect(
      resolveTriviumNewSessionChoice({ chosen: 'claude', hasSessions: true, group: ready })?.agent
    ).toBe('claude')
    expect(
      resolveTriviumNewSessionChoice({ chosen: 'claude', hasSessions: false, group: ready })?.agent
    ).toBe('claude')
    // A picked agent that is no longer offered falls back to the default rule.
    expect(
      resolveTriviumNewSessionChoice({ chosen: 'opencode', hasSessions: true, group: ready })
    ).toBe(null)
  })

  it('has no new-session choice until an agent is known', () => {
    expect(
      resolveTriviumNewSessionChoice({ chosen: null, hasSessions: false, group: group(null) })
    ).toBe(null)
    expect(
      resolveTriviumNewSessionChoice({ chosen: 'claude', hasSessions: false, group: group([]) })
    ).toBe(null)
  })
})
