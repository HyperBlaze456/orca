import { buildTriviumModel, type TriviumModel, type TriviumModelInput } from './trivium-goal-model'
import { buildTriviumTreeEntries, type TriviumTreeEntry } from './trivium-goal-tree'
import type { TriviumFixtureBinary } from './trivium-model-tables.fixture'
import { makeTriviumModelInput } from './trivium-model.fixture'
import type { TriviumTicket } from './trivium-ticket-records'

// Reader tests build on WO-1a's real-shaped fixture, optionally with edited ticket states.

export type ReaderFixture = {
  model: TriviumModel
  entries: TriviumTreeEntry[]
}

/** The real-shaped fixture model; `editTickets` rewrites decoded ticket records first. */
export function makeReaderFixture(
  binary: TriviumFixtureBinary = 'head',
  editTickets?: (ticket: TriviumTicket) => TriviumTicket,
  editInput?: (input: TriviumModelInput) => TriviumModelInput
): ReaderFixture {
  const base = makeTriviumModelInput(binary)
  const edited = editTickets ? { ...base, tickets: base.tickets.map(editTickets) } : base
  const model = buildTriviumModel(editInput ? editInput(edited) : edited)
  return { model, entries: buildTriviumTreeEntries(model) }
}

/** Sets one ticket's workflow state in a fixture edit. */
export function withTicketStates(
  states: Record<string, TriviumTicket['state']>
): (ticket: TriviumTicket) => TriviumTicket {
  return (ticket) =>
    Object.hasOwn(states, ticket.id) ? { ...ticket, state: states[ticket.id] } : ticket
}
