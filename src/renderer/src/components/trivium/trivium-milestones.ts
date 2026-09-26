import type { TriviumModel } from './trivium-goal-model'
import type { TriviumProgressMilestone } from './trivium-progress-records'

/** A milestone of a Campaign anchored elsewhere, tagged with that anchor (null when unknown). */
export type TriviumSubGoalMilestone = TriviumProgressMilestone & { goalId: string | null }

export type TriviumGoalMilestones = {
  /** Milestones of Campaigns anchored on this Goal, in payload order. */
  own: readonly TriviumProgressMilestone[]
  /** Milestones rolled up from Campaigns anchored below this Goal. */
  inSubGoals: readonly TriviumSubGoalMilestone[]
  /** The last own milestone. */
  latest: TriviumProgressMilestone | null
}

export type TriviumContradiction = { campaignId: string; proposalId: string; text: string }
export type TriviumUnknown = { campaignId: string; text: string }

export type TriviumOpenQuestions = {
  contradictions: readonly TriviumContradiction[]
  unknowns: readonly TriviumUnknown[]
}

// Campaign order is the order trivium lists milestones in; unknown Campaigns keep theirs, last.
function byCampaignOrder<T extends { campaignId: string }>(model: TriviumModel, items: T[]): T[] {
  const order = new Map((model.progress?.campaigns ?? []).map((item, index) => [item.id, index]))
  const rank = (item: T): number => order.get(item.campaignId) ?? Number.MAX_SAFE_INTEGER
  return items.sort((a, b) => rank(a) - rank(b))
}

function milestoneKey(milestone: TriviumProgressMilestone): string {
  return `${milestone.campaignId}\n${milestone.proposalId || milestone.summary}`
}

/**
 * HEAD repeats every milestone on each ancestor Goal; 0.15 lists it only on the anchor, so the
 * milestones of sub-Goals are gathered from their own entries as well.
 */
export function triviumGoalMilestones(model: TriviumModel, goalId: string): TriviumGoalMilestones {
  const seen = new Set<string>()
  const relevant: TriviumProgressMilestone[] = []
  const add = (milestone: TriviumProgressMilestone): void => {
    const key = milestoneKey(milestone)
    if (!seen.has(key)) {
      seen.add(key)
      relevant.push(milestone)
    }
  }
  for (const milestone of model.progressGoal(goalId)?.milestones ?? []) {
    add(milestone)
  }
  for (const descendant of model.descendantGoals(goalId)) {
    for (const milestone of model.progressGoal(descendant)?.milestones ?? []) {
      if (model.campaignGoal(milestone.campaignId) === descendant) {
        add(milestone)
      }
    }
  }
  const ordered = byCampaignOrder(model, relevant)
  const own = ordered.filter((milestone) => model.campaignGoal(milestone.campaignId) === goalId)
  return {
    own,
    inSubGoals: ordered
      .filter((milestone) => model.campaignGoal(milestone.campaignId) !== goalId)
      .map((milestone) => ({ ...milestone, goalId: model.campaignGoal(milestone.campaignId) })),
    latest: own.at(-1) ?? null
  }
}

/**
 * The contradictions milestones named (progress conflicts) and their unknowns, each unknown
 * once per (Campaign, text). With a Goal id, only Campaigns anchored on that Goal count.
 */
export function triviumOpenQuestions(
  model: TriviumModel,
  goalId: string | null = null
): TriviumOpenQuestions {
  const inScope = (campaignId: string): boolean =>
    goalId === null || model.campaignGoal(campaignId) === goalId
  const contradictions = (model.progress?.conflicts ?? []).flatMap((conflict) =>
    conflict.kind === 'contradiction' && inScope(conflict.campaignId)
      ? [{ campaignId: conflict.campaignId, proposalId: conflict.proposalId, text: conflict.text }]
      : []
  )
  const seen = new Set<string>()
  const unknowns: TriviumUnknown[] = []
  for (const unknown of (model.progress?.goals ?? []).flatMap((goal) => goal.unknowns)) {
    const key = `${unknown.campaignId}\n${unknown.text}`
    if (!seen.has(key) && inScope(unknown.campaignId)) {
      seen.add(key)
      unknowns.push({ campaignId: unknown.campaignId, text: unknown.text })
    }
  }
  return {
    contradictions: byCampaignOrder(model, contradictions),
    unknowns: byCampaignOrder(model, unknowns)
  }
}
