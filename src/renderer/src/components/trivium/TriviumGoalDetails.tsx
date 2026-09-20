import type {
  TriviumGoalNode,
  TriviumWorkspaceStatus
} from '../../../../shared/trivium-workspace-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { triviumGoalStatusBadgeVariant, triviumTierLabel } from './trivium-status-display'

export function TriviumGoalDetails({
  goal,
  data,
  onSelect,
  onTickets,
  onProgress
}: {
  goal: TriviumGoalNode | null
  data: TriviumWorkspaceStatus
  onSelect: (id: string) => void
  onTickets: (id: string) => void
  onProgress: (id: string) => void
}): React.JSX.Element {
  if (!goal) {
    return (
      <div className="p-5 text-sm leading-relaxed text-muted-foreground">
        {translate(
          'trivium.inspect.chooseGoal',
          'Select a goal in the graph or goal list to read its full description and explore its connections.'
        )}
      </div>
    )
  }
  const relations = [
    {
      relation: 'contributes-to',
      outgoing: true,
      label: translate('trivium.inspect.parents', 'Contributes to')
    },
    {
      relation: 'contributes-to',
      outgoing: false,
      label: translate('trivium.inspect.children', 'Contributing goals')
    },
    {
      relation: 'depends-on',
      outgoing: true,
      label: translate('trivium.inspect.dependencies', 'Depends on')
    },
    {
      relation: 'depends-on',
      outgoing: false,
      label: translate('trivium.inspect.dependents', 'Required by')
    }
  ] as const
  const nodes = new Map(data.goals.nodes.map((node) => [node.id, node]))
  const campaigns = data.campaigns.open.filter((campaign) => campaign.goal_id === goal.id)
  return (
    <section
      aria-label={translate('trivium.inspect.goalDetails', 'Goal details')}
      className="space-y-6 p-5"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{triviumTierLabel(goal.tier)}</span>
          <Badge variant={triviumGoalStatusBadgeVariant(goal.status)}>{goal.status}</Badge>
        </div>
        <h2 className="text-lg leading-snug font-semibold break-words">{goal.title}</h2>
        <p className="font-mono text-xs break-all text-muted-foreground select-text">{goal.id}</p>
        <p className="text-base leading-relaxed whitespace-pre-wrap break-words select-text">
          {goal.statement ||
            translate('trivium.inspect.noStatement', 'No description was recorded for this goal.')}
        </p>
      </div>
      {relations.map(({ relation, outgoing, label }) => {
        const ids = [
          ...new Set(
            data.goals.edges
              .filter(
                (edge) =>
                  edge.relation === relation && (outgoing ? edge.source : edge.target) === goal.id
              )
              .map((edge) => (outgoing ? edge.target : edge.source))
          )
        ]
        if (!ids.length) {
          return null
        }
        return (
          <section key={label} className="space-y-2" aria-label={label}>
            <h3 className="text-sm font-semibold">
              {label} <span className="text-muted-foreground">{ids.length}</span>
            </h3>
            <ul className="space-y-2">
              {ids.map((id) => {
                const related = nodes.get(id)
                return (
                  <li key={id}>
                    {related ? (
                      <button
                        type="button"
                        onClick={() => onSelect(id)}
                        className="w-full space-y-1 rounded-md border border-border p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="block text-xs text-muted-foreground">
                          {triviumTierLabel(related.tier)} · {related.status}
                        </span>
                        <span className="block text-sm leading-relaxed break-words">
                          {related.title}
                        </span>
                      </button>
                    ) : (
                      <p className="text-sm break-words text-muted-foreground">
                        {id} ·{' '}
                        {translate(
                          'trivium.inspect.missingGoal',
                          'Details are not included in this snapshot.'
                        )}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {translate('trivium.inspect.relatedWork', 'Related work')}
        </h3>
        <Button variant="outline" size="sm" onClick={() => onTickets(goal.id)}>
          {translate('trivium.inspect.goalTickets', 'Browse tickets under this goal')}
        </Button>
        {campaigns.map((campaign) => (
          <div key={campaign.campaign_id} className="space-y-2 border-t border-border pt-3">
            <p className="text-sm break-words">
              {campaign.campaign_id} · {campaign.phase}
            </p>
            {campaign.current_feature ? (
              <p className="text-sm break-words">{campaign.current_feature}</p>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => onProgress(campaign.campaign_id)}>
              {translate('trivium.inspect.campaignProgress', 'Read campaign progress')}
            </Button>
          </div>
        ))}
      </section>
    </section>
  )
}
