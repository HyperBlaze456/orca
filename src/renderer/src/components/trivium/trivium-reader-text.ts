import type { TriviumWorkspaceState } from '../../../../shared/trivium-workspace-status'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { TriviumGoalOutcome } from './trivium-goal-work-records'
import type { TriviumFeatureResult } from './trivium-progress-records'
import type { TriviumTicketKind } from './trivium-ticket-kinds'

let countFormat: { locale: string; format: Intl.NumberFormat } | null = null

export function formatTriviumCount(value: number): string {
  const locale = getIntlLocale()
  if (countFormat?.locale !== locale) {
    countFormat = { locale, format: new Intl.NumberFormat(locale) }
  }
  return countFormat.format.format(value)
}

function counted(count: number, one: () => string, many: (n: string) => string): string {
  return count === 1 ? one() : many(formatTriviumCount(count))
}

/** The Overview headline: what the workspace state asks of the user, never activity. */
export function triviumOverviewHeadline(state: TriviumWorkspaceState): string {
  switch (state) {
    case 'review':
      return translate('trivium.overview.headline.review', 'A milestone is ready for your review')
    case 'runnable':
      return translate('trivium.overview.headline.runnable', 'Ready for the next Campaign step')
    case 'active':
      return translate('trivium.overview.headline.active', 'A Campaign is running')
    case 'paused':
      return translate('trivium.overview.headline.paused', 'A Campaign is paused until you decide')
    case 'escalated':
      return translate('trivium.overview.headline.escalated', 'Work is waiting on your decision')
    case 'goal-draft':
      return translate('trivium.overview.headline.goalDraft', 'A Goal draft is ready for review')
    case 'no-adopted-goal':
      return translate('trivium.overview.headline.noAdoptedGoal', 'No Goal has been adopted yet')
    case 'no-harness':
      return translate(
        'trivium.overview.headline.noHarness',
        'This workspace has no Trivium harness'
      )
  }
}

/** Work only: how many tickets under a Goal are done. Never an outcome. */
export function triviumWorkText(work: { done: number; total: number }): string {
  return work.total > 0
    ? translate('trivium.reader.workDone', '{{done}}/{{total}} tickets done', {
        done: formatTriviumCount(work.done),
        total: formatTriviumCount(work.total)
      })
    : translate('trivium.reader.noTickets', 'No tickets yet')
}

export function triviumOutcomeLabel(outcome: TriviumGoalOutcome): string {
  switch (outcome) {
    case 'unassessed':
      return translate('trivium.reader.outcome.unassessed', 'Not assessed')
    case 'achieved':
      return translate('trivium.reader.outcome.achieved', 'Achieved')
    case 'not-achieved':
      return translate('trivium.reader.outcome.notAchieved', 'Not achieved')
  }
}

export function triviumContradictionCount(count: number): string {
  return counted(
    count,
    () => translate('trivium.reader.count.contradictionOne', '1 contradiction'),
    (n) => translate('trivium.reader.count.contradictionMany', '{{n}} contradictions', { n })
  )
}

export function triviumOpenQuestionCount(count: number): string {
  return counted(
    count,
    () => translate('trivium.reader.count.openQuestionOne', '1 open question'),
    (n) => translate('trivium.reader.count.openQuestionMany', '{{n}} open questions', { n })
  )
}

export function triviumPromotionCount(count: number): string {
  return counted(
    count,
    () => translate('trivium.reader.count.promotionOne', '1 promotion candidate'),
    (n) => translate('trivium.reader.count.promotionMany', '{{n}} promotion candidates', { n })
  )
}

export function triviumMilestoneCount(count: number): string {
  return counted(
    count,
    () => translate('trivium.reader.count.milestoneOne', '1 milestone'),
    (n) => translate('trivium.reader.count.milestoneMany', '{{n}} milestones', { n })
  )
}

export function triviumTradeOffCount(count: number): string {
  return counted(
    count,
    () => translate('trivium.reader.count.tradeOffOne', '1 trade-off'),
    (n) => translate('trivium.reader.count.tradeOffMany', '{{n}} trade-offs', { n })
  )
}

export function triviumDriftCount(count: number): string {
  return translate('trivium.reader.count.drift', '{{n}} drift', { n: formatTriviumCount(count) })
}

export function triviumTicketCount(count: number): string {
  return counted(
    count,
    () => translate('trivium.reader.count.ticketOne', '1 ticket'),
    (n) => translate('trivium.reader.count.ticketMany', '{{n}} tickets', { n })
  )
}

/** Header of the Goal page's ticket section when every ticket sits deeper. */
export function triviumTicketsUnderSubGoals(count: number): string {
  return counted(
    count,
    () =>
      translate('trivium.goalPage.ticketUnderSubGoals', 'Its only ticket sits under a sub-goal.'),
    (n) =>
      translate('trivium.goalPage.ticketsUnderSubGoals', 'All {{n}} tickets sit under sub-goals.', {
        n
      })
  )
}

export function triviumShowAllCount(count: number): string {
  return translate('trivium.reader.showAll', 'Show all {{n}}', { n: formatTriviumCount(count) })
}

/** A Feature run's result as the status icon it borrows. */
export function triviumFeatureResultKind(result: TriviumFeatureResult): TriviumTicketKind {
  switch (result) {
    case 'completed':
    case 'deduplicated':
      return 'done'
    case 'in-progress':
      return 'in-progress'
    case 'queued':
      return 'open'
    case 'blocked':
      return 'blocked'
    case 'abandoned':
      return 'abandoned'
  }
}

export function triviumFeatureResultLabel(result: TriviumFeatureResult): string {
  switch (result) {
    case 'completed':
      return translate('trivium.feature.completed', 'Completed')
    case 'deduplicated':
      return translate('trivium.feature.deduplicated', 'Already delivered under another ticket')
    case 'in-progress':
      return translate('trivium.feature.inProgress', 'In progress')
    case 'queued':
      return translate('trivium.feature.queued', 'Queued')
    case 'blocked':
      return translate('trivium.feature.blocked', 'Blocked')
    case 'abandoned':
      return translate('trivium.feature.abandoned', 'Abandoned')
  }
}

const HASH_ALGORITHM_PREFIX = /^[a-z0-9]+:/
const SHORT_REVISION_LENGTH = 12

/** A model revision cut to 12 characters without its `sha256:` style prefix. */
export function triviumShortRevision(revision: string): string {
  return revision.replace(HASH_ALGORITHM_PREFIX, '').slice(0, SHORT_REVISION_LENGTH)
}

/** `invariant.journal-merge-3` → kind `invariant`, name `journal merge 3`. */
export function triviumTheoryIdParts(id: string): { kind: string; name: string } {
  const dot = id.indexOf('.')
  if (dot <= 0) {
    return { kind: '', name: id }
  }
  return { kind: id.slice(0, dot), name: id.slice(dot + 1).replace(/[-_]+/g, ' ') }
}
