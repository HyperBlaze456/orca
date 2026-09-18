import { WorktreeSelector } from './files-target-params'
import { OptionalBoolean, OptionalString } from './rpc-param-primitives'

export const TriviumProgress = WorktreeSelector.extend({
  campaign: OptionalString,
  verbose: OptionalBoolean
})

export const TriviumTickets = WorktreeSelector.extend({
  query: OptionalString,
  under: OptionalString,
  state: OptionalString,
  status: OptionalString
})
