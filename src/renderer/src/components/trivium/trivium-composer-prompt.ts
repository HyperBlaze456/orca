import { translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTierName } from './trivium-harness-text'
import {
  TRIVIUM_DETAILS_LOADED,
  triviumWorkLoadState,
  type TriviumDetailStates
} from './trivium-reader-load'

// The context block goes to the agent, not to the screen, so it stays in plain English
// and names every item by id as well as by title.

// Missing records would read as open tickets and undone work; say they are missing instead.
const RECORDS_MISSING = 'unknown, ticket records are not loaded'
const PROGRESS_MISSING = 'unknown, progress is not loaded'

function named(model: TriviumModel, id: string): string {
  return `${id} (${model.title(id)})`
}

function listLine(label: string, model: TriviumModel, ids: readonly string[]): string[] {
  return ids.length > 0 ? [`${label}: ${ids.map((id) => named(model, id)).join('; ')}`] : []
}

function statementOf(model: TriviumModel, id: string): string {
  return model.node(id)?.statement || model.ticket(id)?.statement || '(no statement recorded)'
}

function describeTicket(model: TriviumModel, id: string, loadState: TriviumDetailStates): string[] {
  const approval = model.ticketKind(id) === 'approval'
  const approve = approval ? model.approveCommand(id) : null
  const commit = model.ticketCommit(id)
  const workflow = loadState.tickets === 'ready' ? model.workState(id) : RECORDS_MISSING
  return [
    'Trivium ticket (selected on the Trivium page):',
    `ID: ${id}`,
    `Title: ${model.title(id)}`,
    `Status: ${model.node(id)?.status ?? model.ticket(id)?.status ?? 'unknown'}`,
    `Workflow state: ${workflow}`,
    ...(approval
      ? [
          'Proposed ticket: it waits for the user to approve it and is not part of the Goal model yet.'
        ]
      : []),
    ...listLine('Goal', model, model.parents(id)),
    ...listLine('Depends on', model, model.dependsOn(id)),
    ...listLine('Required by', model, model.requiredBy(id)),
    ...(commit ? [`Merged commit: ${commit}`] : []),
    ...(approve ? [`Approve command: ${approve}`] : []),
    'Statement:',
    statementOf(model, id)
  ]
}

function describeGoal(model: TriviumModel, id: string, loadState: TriviumDetailStates): string[] {
  const tier = model.node(id)?.tier ?? ''
  const work = model.work(id)
  const done =
    triviumWorkLoadState(loadState, work) === 'ready'
      ? `${work.done}/${work.total} tickets done`
      : work.source === 'recorded-work'
        ? PROGRESS_MISSING
        : RECORDS_MISSING
  const outcome = loadState.progress === 'ready' ? model.outcome(id) : PROGRESS_MISSING
  return [
    'Trivium goal (selected on the Trivium page):',
    `ID: ${id}`,
    `Tier: ${tier.toUpperCase()} (${triviumTierName(tier)})`,
    `Status: ${model.node(id)?.status ?? 'unknown'}`,
    `Title: ${model.title(id)}`,
    ...listLine('Contributes to', model, model.parents(id)),
    ...listLine('Sub-goals', model, model.subGoals(id)),
    ...listLine('Depends on', model, model.dependsOn(id)),
    ...listLine('Required by', model, model.requiredBy(id)),
    `Work: ${done} (work only; the outcome is ${outcome})`,
    'Statement:',
    statementOf(model, id)
  ]
}

/** The item as it reads when the user presses Send; later navigation does not change it. */
export function describeTriviumItemForAgent(
  model: TriviumModel,
  id: string,
  loadState: TriviumDetailStates = TRIVIUM_DETAILS_LOADED
): string {
  return (
    model.isTicket(id) ? describeTicket(model, id, loadState) : describeGoal(model, id, loadState)
  ).join('\n')
}

export function buildTriviumComposerPrompt(itemContext: string, request: string): string {
  return `${itemContext}\n\nRequest:\n${request.trim()}`
}

/** Quick starts that fill the draft; the user still edits and sends. */
export function triviumComposerChips(isTicket: boolean): string[] {
  return isTicket
    ? [
        translate('trivium.composer.chip.explainTicket', 'Explain this ticket'),
        translate('trivium.composer.chip.dependencies', 'What does it depend on?'),
        translate('trivium.composer.chip.plan', 'Draft a plan')
      ]
    : [
        translate('trivium.composer.chip.explainGoal', 'Explain this goal'),
        translate('trivium.composer.chip.split', 'Split into sub-goals'),
        translate('trivium.composer.chip.conflicts', 'Find conflicts')
      ]
}

/**
 * The draft "Ask the agent to approve" writes: the user's own approval in their words and the
 * command, for the user to send. The page itself never approves anything.
 */
export function triviumApprovalRequest(model: TriviumModel, id: string): string {
  const title = model.title(id)
  const command = model.approveCommand(id)
  return command
    ? translate(
        'trivium.composer.approveWithCommand',
        'I approve the proposed ticket “{{title}}” ({{id}}). Adopt it by running this command with my name as the approver: {{command}}',
        { title, id, command }
      )
    : translate(
        'trivium.composer.approve',
        "I approve the proposed ticket “{{title}}” ({{id}}). Adopt it with trivium's ticket approve command, with my name as the approver.",
        { title, id }
      )
}
