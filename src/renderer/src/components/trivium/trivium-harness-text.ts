import type { TriviumCampaignPhase } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'

const CAMPAIGN_ID_PATTERN = /\bcampaign\.([\w-]+(?:\.[\w-]+)*)/g
// trivium capitalizes its model nouns ("1 Campaign(s)", "2 Goal interview(s)").
const COUNTED_NOUN_PATTERN = /\b(\d+) ([A-Za-z][A-Za-z -]*?)\(s\)/g
const ID_KIND_PATTERN = /^(?:campaign|goal|ticket|feature|proposal|interview)\./
const HASH_ALGORITHM_PATTERN = /^[a-z0-9]+:/
const SHORT_SHA_LENGTH = 7

/**
 * A harness sentence (`state_reason`) as plain reading text: campaign ids lose their kind
 * prefix, "synthesized a milestone" reads as what happened, and "N thing(s)" is pluralized.
 * Backticks are kept for the rich-text renderer.
 */
export function humanizeTriviumReason(reason: string): string {
  return reason
    .replace(CAMPAIGN_ID_PATTERN, '$1')
    .replace(/synthesized a milestone/g, 'wrote a milestone summary')
    .replace(COUNTED_NOUN_PATTERN, (_match, count: string, noun: string) =>
      count === '1' ? `${count} ${noun}` : `${count} ${noun}s`
    )
}

/** `ticket.memory-applicability` → `memory-applicability`. */
export function triviumIdSlug(id: string): string {
  return id.replace(ID_KIND_PATTERN, '')
}

/** A commit or content hash cut to 7 characters; an `sha256:` style prefix is dropped. */
export function shortTriviumSha(value: string): string {
  return value.replace(HASH_ALGORITHM_PATTERN, '').slice(0, SHORT_SHA_LENGTH)
}

/** The tier's role in words: G0 Vision, G1 Outcome, G2 Campaign outcome, G3 Ticket. */
export function triviumTierName(tier: string): string {
  switch (tier) {
    case 'g0':
      return translate('trivium.tier.g0', 'Vision')
    case 'g1':
      return translate('trivium.tier.g1', 'Outcome')
    case 'g2':
      return translate('trivium.tier.g2', 'Campaign outcome')
    case 'g3':
      return translate('trivium.tier.g3', 'Ticket')
    default:
      return tier.toUpperCase()
  }
}

/** A Campaign phase in words; a phase this build does not know is shown as sent. */
export function triviumCampaignPhaseLabel(phase: TriviumCampaignPhase): string {
  switch (phase) {
    case 'started':
      return translate('trivium.phase.started', 'Started')
    case 'active':
      return translate('trivium.phase.active', 'Running')
    case 'paused':
      return translate('trivium.phase.paused', 'Paused')
    case 'milestone-reached':
      return translate('trivium.phase.milestoneReached', 'Milestone reached')
    case 'milestone-recorded':
      return translate('trivium.phase.milestoneRecorded', 'Milestone recorded')
    case 'milestone-synthesized':
      return translate('trivium.phase.milestoneSynthesized', 'Milestone written')
    case 'milestone-closed':
      return translate('trivium.phase.milestoneClosed', 'Closed')
    default:
      return phase
  }
}

/** A paused Campaign and a reached milestone both wait on the user's decision. */
export function triviumCampaignPhaseNeedsUser(phase: TriviumCampaignPhase): boolean {
  return phase === 'paused' || phase === 'milestone-reached'
}
