import { useState } from 'react'
import type { TriviumGoals } from '../../../../shared/trivium-workspace-status'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import { triviumGoalStatusBadgeVariant, triviumTierLabel } from './trivium-status-display'

export function TriviumGoalList({
  goals,
  selectedId,
  onSelect
}: {
  goals: TriviumGoals
  selectedId: string | null
  onSelect: (id: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase()
  const nodes = goals.nodes.filter((goal) =>
    `${goal.id} ${goal.title} ${goal.statement}`.toLocaleLowerCase().includes(search)
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={translate('trivium.inspect.searchGoals', 'Search goals')}
          placeholder={translate(
            'trivium.inspect.searchPlaceholder',
            'Search titles, descriptions or IDs…'
          )}
        />
        <p className="text-sm text-muted-foreground">
          {translate(
            'trivium.inspect.listScope',
            'All statuses are included. Select a goal to read more.'
          )}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-sleek">
        {nodes.length ? (
          <ul className="space-y-3">
            {nodes.map((goal) => (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() => onSelect(goal.id)}
                  aria-pressed={selectedId === goal.id}
                  className="w-full space-y-2 rounded-lg border border-border p-4 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-accent"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {triviumTierLabel(goal.tier)}
                    </span>
                    <Badge variant={triviumGoalStatusBadgeVariant(goal.status)}>
                      {goal.status}
                    </Badge>
                  </span>
                  <span className="block text-base font-medium break-words">{goal.title}</span>
                  <span className="block line-clamp-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {goal.statement}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate('trivium.graph.noMatches', 'No goals match this filter.')}
          </p>
        )}
      </div>
    </div>
  )
}
