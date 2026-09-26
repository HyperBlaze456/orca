import { buildTriviumModel, type TriviumModel } from './trivium-goal-model'
import { buildTriviumTreeEntries, type TriviumTreeEntry } from './trivium-goal-tree'
import { makeSmallTriviumStatus } from './trivium-model.fixture'
import {
  buildTriviumTreeRows,
  triviumTreeFilter,
  triviumTreeItemMatches,
  type TriviumTreeRow
} from './trivium-tree-rows'

/**
 * A three-level outline for connector and lane tests (titles are "Title of <id>"):
 * root ─┬─ a ── a1 ── [t.1, t.2]
 *       └─ b (anticipated) ── [t.3]
 * t.2 and t.3 depend on t.1.
 */
export function makeSmallTreeModel(): TriviumModel {
  return buildTriviumModel({
    status: makeSmallTriviumStatus(
      [
        ['goal.root', 'g0', 'adopted'],
        ['goal.a', 'g1', 'adopted'],
        ['goal.b', 'g1', 'anticipated'],
        ['goal.a1', 'g2', 'adopted'],
        ['t.1', 'g3', 'adopted'],
        ['t.2', 'g3', 'adopted'],
        ['t.3', 'g3', 'adopted']
      ],
      [
        ['goal.a', 'goal.root'],
        ['goal.b', 'goal.root'],
        ['goal.a1', 'goal.a'],
        ['t.1', 'goal.a1'],
        ['t.2', 'goal.a1'],
        ['t.3', 'goal.b'],
        ['t.2', 't.1', 'depends-on'],
        ['t.3', 't.1', 'depends-on']
      ]
    ),
    tickets: [],
    progress: null
  })
}

/** Keys of every row that can open: the whole outline expanded. */
export function everyOpenKey(entries: readonly TriviumTreeEntry[]): Set<string> {
  const keys = new Set<string>()
  const walk = (list: readonly TriviumTreeEntry[]): void => {
    for (const entry of list) {
      if (entry.kind !== 'ticket' && entry.children.length > 0) {
        keys.add(entry.key)
        walk(entry.children)
      }
    }
  }
  walk(entries)
  return keys
}

/** The rows the pane shows for an expansion and filter text. */
export function makeTreeRows(
  model: TriviumModel,
  expanded: ReadonlySet<string>,
  query = ''
): TriviumTreeRow[] {
  const filter = triviumTreeFilter(query)
  return buildTriviumTreeRows(buildTriviumTreeEntries(model), {
    expanded,
    filter,
    matches: (id) => (filter ? triviumTreeItemMatches(model, id, filter) : true)
  })
}
