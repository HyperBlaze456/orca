import { isTriviumRecord } from './trivium-workspace-query'
import {
  readPayloadCount,
  readPayloadOptionalText,
  readPayloadRecords,
  readPayloadText
} from './trivium-payload-fields'

// Per-Goal fields `trivium view progress` emits at repo HEAD (trivium/view/progress.py `_goal`)
// and the installed 0.15 binary omits. Every reader returns null or [] when a field is absent.

/** GoalDelivery; open so a newer value passes through. */
export type TriviumGoalDelivery = 'not-started' | 'in-progress' | 'delivered' | (string & {})
export type TriviumGoalOutcome = 'unassessed' | 'achieved' | 'not-achieved'

/** `recorded_work`: what execution delivered under the Goal, independent of its outcome. */
export type TriviumRecordedWork = {
  delivery: TriviumGoalDelivery
  completedFeatures: number
  openFeatures: number
  abandonedFeatures: number
  completedTickets: number
  outstandingTickets: number
}

export type TriviumGoalCriterion = { text: string; verdict: string }

export type TriviumGoalAssessment = {
  delivery: TriviumGoalDelivery
  outcome: TriviumGoalOutcome
  criteria: TriviumGoalCriterion[]
  assessedBy: string | null
  explanation: string | null
}

/** Why a Feature proposed a ticket, and the command that would adopt it. */
export type TriviumDerivedOutcome = {
  featureId: string
  hypothesis: string
  approve: string | null
  ticketId: string | null
}

export function readTriviumRecordedWork(value: unknown): TriviumRecordedWork | null {
  // Without both ticket counts the record cannot stand in for the derived count.
  if (
    !isTriviumRecord(value) ||
    typeof value.completed_tickets !== 'number' ||
    typeof value.outstanding_tickets !== 'number'
  ) {
    return null
  }
  return {
    delivery: readPayloadText(value.delivery) || 'not-started',
    completedFeatures: readPayloadCount(value.completed_features),
    openFeatures: readPayloadCount(value.open_features),
    abandonedFeatures: readPayloadCount(value.abandoned_features),
    completedTickets: value.completed_tickets,
    outstandingTickets: value.outstanding_tickets
  }
}

export function readTriviumGoalOutcome(value: unknown): TriviumGoalOutcome | null {
  return value === 'unassessed' || value === 'achieved' || value === 'not-achieved' ? value : null
}

export function readTriviumGoalAssessment(value: unknown): TriviumGoalAssessment | null {
  if (!isTriviumRecord(value)) {
    return null
  }
  return {
    delivery: readPayloadText(value.delivery) || 'not-started',
    outcome: readTriviumGoalOutcome(value.outcome) ?? 'unassessed',
    // The payload names a criterion by id; its text is only reachable through the CLI.
    criteria: readPayloadRecords(value.criteria).flatMap((criterion) => {
      const text = readPayloadText(criterion.text) || readPayloadText(criterion.criterion_id)
      return text ? [{ text, verdict: readPayloadText(criterion.verdict) || 'unknown' }] : []
    }),
    assessedBy: readPayloadOptionalText(value.assessed_by),
    explanation: readPayloadOptionalText(value.explanation)
  }
}

const APPROVED_TICKET_PATTERN = /\bticket\.[\w-]+(?:\.[\w-]+)*/

export function readTriviumDerivedOutcomes(value: unknown): TriviumDerivedOutcome[] {
  return readPayloadRecords(value).flatMap((outcome) => {
    const approve = readPayloadOptionalText(outcome.approve)
    const ticketId =
      readPayloadOptionalText(outcome.ticket_id) ??
      readPayloadOptionalText(outcome.ticket) ??
      approve?.match(APPROVED_TICKET_PATTERN)?.[0] ??
      null
    const featureId = readPayloadText(outcome.feature_id)
    return featureId || ticketId
      ? [{ featureId, hypothesis: readPayloadText(outcome.hypothesis), approve, ticketId }]
      : []
  })
}
