import type {
  TriviumTicketState,
  TriviumGoalNode
} from '../../../../shared/trivium-workspace-status'
import { makeTriviumStatus } from './trivium-workspace-status.fixture'

// Matches the fields serialized by Trivium 0.15 TicketRecord and TicketViewer.
export function makeTriviumTicketRecords() {
  const entries: [string, string, TriviumTicketState, string][] = [
    ['checkpoint', 'Persist upload checkpoints', 'done', 'goal.persistence'],
    ['resume', 'Resume from the last confirmed chunk', 'in-progress', 'goal.persistence'],
    ['retry', 'Retry the last chunk once', 'in-progress', 'goal.retry'],
    ['expired', 'Handle expired upload tokens', 'blocked', 'goal.recovery'],
    ['limits', 'Define retry limits', 'open', 'goal.retry'],
    ['errors', 'Explain unrecoverable upload errors', 'open', 'goal.errors'],
    ['detect', 'Detect interrupted uploads', 'done', 'goal.recovery'],
    ['checksum', 'Validate completed upload checksums', 'done', 'goal.persistence']
  ]
  return entries.map(([id, title, state, parent]) => ({
    id: `ticket.${id}`,
    title,
    statement: `Description of ${title.toLocaleLowerCase()}. Preserve the last confirmed checkpoint.`,
    status: id === 'limits' ? ('candidate' as const) : ('adopted' as const),
    parent,
    depends_on: id === 'retry' ? ['ticket.checkpoint'] : [],
    state,
    features: state === 'done' ? [{ feature_id: `feature.${id}`, merged_commit: 'abc123' }] : [],
    paths: [],
    blocks: id === 'checkpoint' ? 1 : 0,
    awaiting: id === 'limits' ? 'approve' : null,
    approve: id === 'limits' ? 'trivium model ticket approve ticket.limits' : null
  }))
}

export function makeTriviumDesignStatus() {
  const status = makeTriviumStatus()
  const goals: TriviumGoalNode[] = [
    {
      id: 'goal.persistence',
      tier: 'g2',
      title: 'Chunk persistence',
      statement: 'Keep confirmed chunks.',
      status: 'adopted'
    },
    {
      id: 'goal.retry',
      tier: 'g2',
      title: 'Retry policy',
      statement: 'Recover transient failures with a bounded retry.',
      status: 'adopted'
    },
    {
      id: 'goal.recovery',
      tier: 'g2',
      title: 'Session recovery',
      statement: 'Recover interrupted sessions.',
      status: 'adopted'
    },
    {
      id: 'goal.errors',
      tier: 'g2',
      title: 'Clear failure messages',
      statement: 'Explain errors.',
      status: 'adopted'
    }
  ]
  status.goals.nodes.push(...goals)
  for (const goal of goals) {
    status.goals.edges.push({
      id: `edge.${goal.id}`,
      source: goal.id,
      target: 'goal.outcome',
      relation: 'contributes-to'
    })
  }
  for (const ticket of makeTriviumTicketRecords()) {
    status.goals.nodes.push({
      id: ticket.id,
      title: ticket.title,
      statement: ticket.statement,
      tier: 'g3',
      status: ticket.status
    })
    status.goals.edges.push({
      id: `edge.${ticket.id}`,
      source: ticket.id,
      target: ticket.parent,
      relation: 'contributes-to'
    })
    for (const dependency of ticket.depends_on) {
      status.goals.edges.push({
        id: `dependency.${ticket.id}`,
        source: ticket.id,
        target: dependency,
        relation: 'depends-on'
      })
    }
  }
  status.goals.edges.push({
    id: 'shared-parent',
    source: 'ticket.retry',
    target: 'goal.recovery',
    relation: 'contributes-to'
  })
  status.goals.counts = { g0: 1, g1: 1, g2: 4, g3: 8 }
  status.tickets.by_state = { open: 2, 'in-progress': 2, blocked: 1, done: 3, abandoned: 0 }
  return status
}
