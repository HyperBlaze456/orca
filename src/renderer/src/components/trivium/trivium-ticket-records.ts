import type {
  TriviumGoals,
  TriviumGoalStatus,
  TriviumTicketState
} from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import {
  readPayloadCount,
  readPayloadOptionalText,
  readPayloadRecords,
  readPayloadStrings
} from './trivium-payload-fields'
import { TRIVIUM_FEATURE_RESULTS, type TriviumFeatureResult } from './trivium-progress-records'
import { isTriviumRecord } from './trivium-workspace-query'

/**
 * One Feature run for a ticket. `trivium.tickets` sends `{feature_id, merged_commit}`; the
 * progress projection's per-Goal tickets send `{feature_id, campaign_id, result}`.
 */
export type TriviumTicketFeature = {
  featureId: string
  mergedCommit: string | null
  result: TriviumFeatureResult | null
  campaignId: string | null
}

// The ticket-view projection exposes workflow separately from Goal adoption.
export type TriviumTicket = {
  id: string
  title: string
  statement: string
  state: TriviumTicketState | null
  status: TriviumGoalStatus | null
  parent: string | null
  dependsOn: string[] | null
  features: TriviumTicketFeature[]
  /** Files the ticket's Feature runs touched or were allowed to touch. */
  paths: string[]
  /** Unfinished tickets that transitively wait on this one. */
  blocks: number
  /** `'approve'` while the ticket is a candidate waiting for the user. */
  awaiting: string | null
  approve: string | null
  raw: Record<string, unknown>
}

function readTriviumTicketFeatures(value: unknown): TriviumTicketFeature[] {
  return readPayloadRecords(value).flatMap((feature) => {
    const featureId = readPayloadOptionalText(feature.feature_id)
    const result = TRIVIUM_FEATURE_RESULTS.find((item) => item === feature.result) ?? null
    return featureId
      ? [
          {
            featureId,
            mergedCommit: readPayloadOptionalText(feature.merged_commit),
            result,
            campaignId: readPayloadOptionalText(feature.campaign_id)
          }
        ]
      : []
  })
}

export function readTriviumTickets(data?: Record<string, unknown>): TriviumTicket[] {
  if (!Array.isArray(data?.tickets)) {
    return []
  }
  return data.tickets.flatMap((raw: unknown) => {
    if (!isTriviumRecord(raw) || typeof raw.id !== 'string' || !raw.id) {
      throw new Error(
        translate('trivium.inspect.invalid', 'The host returned an unreadable response.')
      )
    }
    const state = raw.state
    const status = raw.status
    return [
      {
        id: raw.id,
        title: typeof raw.title === 'string' ? raw.title : raw.id,
        statement: typeof raw.statement === 'string' ? raw.statement : '',
        state:
          state === 'open' ||
          state === 'in-progress' ||
          state === 'blocked' ||
          state === 'done' ||
          state === 'abandoned'
            ? state
            : null,
        // Open vocabulary: an unknown status passes through and renders neutrally.
        status: typeof status === 'string' && status ? status : null,
        parent: typeof raw.parent === 'string' ? raw.parent : null,
        dependsOn: Array.isArray(raw.depends_on)
          ? raw.depends_on.filter((id): id is string => typeof id === 'string')
          : null,
        features: readTriviumTicketFeatures(raw.features),
        paths: readPayloadStrings(raw.paths),
        blocks: readPayloadCount(raw.blocks),
        awaiting: readPayloadOptionalText(raw.awaiting),
        approve: readPayloadOptionalText(raw.approve),
        raw
      }
    ]
  })
}

export function ticketParentIds(ticket: TriviumTicket, goals: TriviumGoals): string[] {
  return [
    ...new Set([
      ...(ticket.parent ? [ticket.parent] : []),
      ...goals.edges
        .filter((edge) => edge.source === ticket.id && edge.relation === 'contributes-to')
        .map((edge) => edge.target)
    ])
  ]
}

export function goalAncestors(ids: string[], goals: TriviumGoals): Set<string> {
  const parents = new Map<string, string[]>()
  for (const edge of goals.edges) {
    if (edge.relation === 'contributes-to') {
      parents.set(edge.source, [...(parents.get(edge.source) ?? []), edge.target])
    }
  }
  const seen = new Set<string>()
  const pending = [...ids]
  while (pending.length) {
    const id = pending.pop()!
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    pending.push(...(parents.get(id) ?? []))
  }
  return seen
}

export function ticketIsUnder(ticket: TriviumTicket, goalId: string, goals: TriviumGoals): boolean {
  return goalAncestors([ticket.id, ...ticketParentIds(ticket, goals)], goals).has(goalId)
}

export function buildTriviumTicketPrompt(
  ticket: TriviumTicket,
  goals: TriviumGoals,
  instruction: string
): string {
  return [
    'Trivium ticket context:',
    ticket.id,
    ticket.title,
    ticket.statement,
    `Workflow: ${ticket.state ?? 'not provided'}`,
    `Adoption: ${ticket.status ?? 'not provided'}`,
    `Contributes to: ${ticketParentIds(ticket, goals).join(', ')}`,
    `Depends on: ${ticket.dependsOn?.join(', ') ?? 'not provided'}`,
    '',
    'Requested change:',
    instruction.trim()
  ].join('\n')
}
