import { describe, expect, it } from 'vitest'
import { buildTriviumModel } from './trivium-goal-model'
import { triviumGoalMilestones, triviumOpenQuestions } from './trivium-milestones'
import { G0, G1_SEARCH, G1_SYNC, G2 } from './trivium-model-tables.fixture'
import { makeTriviumFixtureModel, makeTriviumModelInput } from './trivium-model.fixture'

const campaigns = (items: readonly { campaignId: string }[]): string[] =>
  items.map((item) => item.campaignId)

describe('triviumGoalMilestones', () => {
  it('splits own milestones from rolled-up ones the same way for both binaries', () => {
    for (const binary of ['head', 'installed'] as const) {
      const model = makeTriviumFixtureModel(binary)
      const slice = triviumGoalMilestones(model, G2)
      expect(campaigns(slice.own)).toEqual([
        'campaign.sync-first-slice',
        'campaign.sync-contradictions'
      ])
      expect(slice.inSubGoals).toEqual([])
      expect(slice.latest?.campaignId).toBe('campaign.sync-contradictions')
      const root = triviumGoalMilestones(model, G0)
      expect(campaigns(root.own)).toEqual(['campaign.self-hosted-pilot'])
      expect(root.inSubGoals.map((item) => [item.campaignId, item.goalId])).toEqual([
        ['campaign.sync-first-slice', G2],
        ['campaign.sync-contradictions', G2],
        ['campaign.ticket-dogfood', G1_SEARCH]
      ])
      const sync = triviumGoalMilestones(model, G1_SYNC)
      expect(sync.own).toEqual([])
      expect(sync.latest).toBeNull()
      expect(campaigns(sync.inSubGoals)).toEqual(campaigns(slice.own))
    }
  })
})

describe('triviumOpenQuestions', () => {
  it('lists every contradiction and each unknown once per Campaign and text', () => {
    const model = makeTriviumFixtureModel('head')
    const all = triviumOpenQuestions(model)
    expect(all.contradictions).toHaveLength(8)
    // HEAD repeats every unknown on each ancestor Goal; they are listed once.
    expect(all.unknowns).toHaveLength(11)
    expect(triviumOpenQuestions(model, G2).unknowns).toHaveLength(6)
    expect(triviumOpenQuestions(model, G2).contradictions).toHaveLength(5)
    expect(triviumOpenQuestions(model, G1_SEARCH).contradictions).toHaveLength(2)
    expect(triviumOpenQuestions(model, G1_SYNC)).toEqual({ contradictions: [], unknowns: [] })
  })

  it('dedupes by Campaign and text, not by text alone', () => {
    const input = makeTriviumModelInput('installed')
    const progress = input.progress
    if (!progress) {
      throw new Error('fixture progress missing')
    }
    const [first] = progress.goals
    first.unknowns = [
      { campaignId: 'campaign.sync-first-slice', text: 'Same question?' },
      { campaignId: 'campaign.sync-first-slice', text: 'Same question?' },
      { campaignId: 'campaign.ticket-dogfood', text: 'Same question?' }
    ]
    const questions = triviumOpenQuestions(buildTriviumModel({ ...input, progress }))
    expect(
      questions.unknowns
        .filter((item) => item.text === 'Same question?')
        .map((item) => item.campaignId)
    ).toEqual(['campaign.sync-first-slice', 'campaign.ticket-dogfood'])
    expect(triviumOpenQuestions(buildTriviumModel({ ...input, progress: null }))).toEqual({
      contradictions: [],
      unknowns: []
    })
  })
})
