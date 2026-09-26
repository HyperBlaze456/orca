import { describe, expect, it } from 'vitest'
import {
  makeTriviumModelStatus,
  makeTriviumModelTicketRecords
} from './trivium-model-graph.fixture'
import { makeTriviumModelProgress } from './trivium-model-progress.fixture'
import { G0 } from './trivium-model-tables.fixture'
import { makeTriviumModelInput } from './trivium-model.fixture'

const HANGUL = /[가-힣]/
const LATIN = /[A-Za-z]/

function goalEntries(binary: 'head' | 'installed'): Record<string, unknown>[] {
  const goals = makeTriviumModelProgress(binary).goals
  return Array.isArray(goals) ? goals : []
}

describe('real-shaped Trivium fixture', () => {
  it('has the proportions of the real harness', () => {
    const { goals, tickets } = makeTriviumModelStatus()
    const tiers = { g0: 0, g1: 0, g2: 0, g3: 0 }
    for (const node of goals.nodes) {
      tiers[node.tier] += 1
    }
    expect(tiers).toEqual({ g0: 1, g1: 2, g2: 1, g3: 14 })
    expect(goals.counts).toEqual(tiers)
    expect(goals.edges.filter((edge) => edge.relation === 'depends-on')).toHaveLength(12)
    expect(goals.edges.filter((edge) => edge.relation === 'contributes-to')).toHaveLength(17)
    expect(goals.nodes.some((node) => node.tier === 'g3' && node.id.startsWith('goal.'))).toBe(true)
    expect(tickets.candidates).toHaveLength(3)
    const records = makeTriviumModelTicketRecords()
    const candidates = records.filter((record) => record.status === 'candidate')
    expect(candidates).toHaveLength(3)
    // One candidate's finished Feature run is listed on its ticket record.
    expect(
      candidates.filter((record) => Array.isArray(record.features) && record.features.length > 0)
    ).toHaveLength(1)
  })

  it('mixes Korean and English text at the real lengths', () => {
    const { nodes } = makeTriviumModelStatus().goals
    const titles = nodes.map((node) => node.title.length)
    expect(Math.min(...titles)).toBe(17)
    expect(Math.max(...titles)).toBe(104)
    expect(nodes.some((node) => HANGUL.test(node.title) && LATIN.test(node.title))).toBe(true)
    expect(nodes.some((node) => !HANGUL.test(node.title))).toBe(true)
    const statements = nodes.map((node) => node.statement.length)
    expect(Math.max(...statements)).toBeGreaterThan(1100)
    expect(Math.max(...statements)).toBeLessThanOrEqual(1240)
    expect(nodes.some((node) => node.statement.includes('`'))).toBe(true)
  })

  it('sends 8 contradictions and unassessed outcomes in both binaries', () => {
    for (const binary of ['head', 'installed'] as const) {
      const conflicts = makeTriviumModelProgress(binary).conflicts
      expect(Array.isArray(conflicts) ? conflicts : []).toHaveLength(8)
    }
    expect(goalEntries('head').map((goal) => goal.outcome)).toEqual([
      'unassessed',
      'unassessed',
      'unassessed',
      'unassessed'
    ])
  })

  it('rolls work up only in the HEAD binary', () => {
    const head = goalEntries('head')
    const installed = goalEntries('installed')
    expect(head.every((goal) => 'recorded_work' in goal && 'assessment' in goal)).toBe(true)
    expect(installed.some((goal) => 'recorded_work' in goal || 'outcome' in goal)).toBe(false)
    const ticketsUnder = (goals: Record<string, unknown>[]): unknown =>
      goals.find((goal) => goal.goal_id === G0)?.tickets
    expect(ticketsUnder(head)).toHaveLength(14)
    expect(ticketsUnder(installed)).toEqual([])
    expect(makeTriviumModelTicketRecords('installed').some((record) => 'approve' in record)).toBe(
      false
    )
  })

  it('decodes in both binaries', () => {
    for (const binary of ['head', 'installed'] as const) {
      const input = makeTriviumModelInput(binary)
      expect(input.tickets).toHaveLength(14)
      expect(input.progress?.goals).toHaveLength(4)
    }
  })
})
