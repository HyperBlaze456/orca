import { describe, expect, it } from 'vitest'
import { buildTriviumTreeEntries } from './trivium-goal-tree'
import { buildTriviumTreeGutters, type TriviumTreeColumn } from './trivium-tree-connectors'
import { everyOpenKey, makeSmallTreeModel, makeTreeRows } from './trivium-tree-model.fixture'

const model = makeSmallTreeModel()
const rows = makeTreeRows(model, everyOpenKey(buildTriviumTreeEntries(model)))
const A1_GROUP = 'goal.root>goal.a>goal.a1>goal.a1#tickets'

// Guides as `│`, blanks as ` `, elbows as `├`/`└`; `*` marks a strong part.
function draw(column: TriviumTreeColumn): string {
  switch (column.kind) {
    case 'blank':
      return ' '
    case 'guide':
      return column.strong ? '│*' : '│'
    case 'elbow': {
      const glyph = column.joint === 'mid' ? '├' : '└'
      return column.strong === 'none' ? glyph : `${glyph}${column.strong === 'path' ? '*' : '|'}`
    }
  }
}

function picture(selectedKey: string | null): string[] {
  return buildTriviumTreeGutters(rows, selectedKey).map((gutter, index) => {
    const down = gutter.down === 'none' ? '' : gutter.down === 'strong' ? 'v*' : 'v'
    return [...gutter.columns.map(draw), rows[index].id, down].filter(Boolean).join(' ')
  })
}

describe('buildTriviumTreeGutters', () => {
  it('draws guides, mid and end elbows and down-connectors for a three-level outline', () => {
    expect(picture(null)).toEqual([
      'goal.root v',
      '├ goal.a v',
      '│ └ goal.a1 v',
      '│   └ goal.a1#tickets v',
      '│     ├ t.1',
      '│     └ t.2',
      '└ goal.b v',
      '  └ goal.b#tickets v',
      '    └ t.3'
    ])
  })

  it('keys each column by the ancestor whose line it carries', () => {
    const [t1] = buildTriviumTreeGutters(rows, null).slice(4, 5)
    expect(t1.columns.map((column) => column.ancestorKey)).toEqual([
      'goal.root',
      'goal.root>goal.a',
      'goal.root>goal.a>goal.a1',
      A1_GROUP
    ])
  })

  it('draws the selected row’s ancestry strong, down through the rows it passes', () => {
    expect(picture(`${A1_GROUP}>t.2`)).toEqual([
      'goal.root v*',
      '├* goal.a v*',
      '│ └* goal.a1 v*',
      '│   └* goal.a1#tickets v*',
      '│     ├| t.1',
      '│     └* t.2',
      '└ goal.b v',
      '  └ goal.b#tickets v',
      '    └ t.3'
    ])
    expect(picture('goal.root>goal.b>goal.b#tickets>t.3')).toEqual([
      'goal.root v*',
      '├| goal.a v',
      '│* └ goal.a1 v',
      '│*   └ goal.a1#tickets v',
      '│*     ├ t.1',
      '│*     └ t.2',
      '└* goal.b v*',
      '  └* goal.b#tickets v*',
      '    └* t.3'
    ])
  })

  it('keeps an open selected row’s own down-connector plain and ignores a hidden selection', () => {
    expect(picture('goal.root>goal.a')).toEqual([
      'goal.root v*',
      '├* goal.a v',
      '│ └ goal.a1 v',
      '│   └ goal.a1#tickets v',
      '│     ├ t.1',
      '│     └ t.2',
      '└ goal.b v',
      '  └ goal.b#tickets v',
      '    └ t.3'
    ])
    expect(picture('goal.root>goal.gone')).toEqual(picture(null))
  })
})
