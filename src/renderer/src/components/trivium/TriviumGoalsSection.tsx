import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TriviumGoals } from '../../../../shared/trivium-workspace-status'
import { Badge } from '../ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { translate } from '@/i18n/i18n'
import { TriviumSection } from './TriviumSection'
import { buildTriviumGoalOutline, type TriviumGoalOutlineNode } from './trivium-goal-outline'
import {
  shortenTriviumId,
  triviumGoalStatusBadgeVariant,
  triviumTierLabel
} from './trivium-status-display'

const INDENT_PER_DEPTH_PX = 14

function GoalBranch({
  branch,
  depth
}: {
  branch: TriviumGoalOutlineNode
  depth: number
}): React.JSX.Element {
  const { node } = branch
  return (
    <div>
      <Collapsible>
        <CollapsibleTrigger
          className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
          style={{ paddingLeft: `${8 + depth * INDENT_PER_DEPTH_PX}px` }}
        >
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <Badge variant="outline" className="shrink-0 font-mono">
            {node.tier.toUpperCase()}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{node.title}</span>
          {branch.shared ? (
            <Badge variant="outline" className="shrink-0">
              {translate('auto.components.trivium.TriviumGoalsSection.shared', 'Shared')}
            </Badge>
          ) : null}
          <Badge variant={triviumGoalStatusBadgeVariant(node.status)} className="shrink-0">
            {node.status}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className="space-y-1 py-1 pr-2"
            style={{ paddingLeft: `${34 + depth * INDENT_PER_DEPTH_PX}px` }}
          >
            <p className="text-xs text-muted-foreground">{node.statement}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{node.id}</p>
            <p className="text-[11px] text-muted-foreground">{triviumTierLabel(node.tier)}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {branch.children.map((child) => (
        <GoalBranch key={`${node.id}/${child.node.id}`} branch={child} depth={depth + 1} />
      ))}
    </div>
  )
}

/** The Goal Graph by tier: G0 down to G3, with `depends-on` listed separately. */
export function TriviumGoalsSection({ goals }: { goals: TriviumGoals }): React.JSX.Element {
  const outline = useMemo(
    () => buildTriviumGoalOutline(goals.nodes, goals.edges),
    [goals.edges, goals.nodes]
  )

  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumGoalsSection.title', 'Goals')}
      meta={
        <div className="flex flex-wrap items-center gap-x-3">
          <span>
            {translate(
              'auto.components.trivium.TriviumGoalsSection.counts',
              '{{adopted}}/{{normative}} adopted · G0 {{g0}} · G1 {{g1}} · G2 {{g2}} · G3 {{g3}}',
              {
                adopted: goals.adopted_normative,
                normative: goals.normative,
                g0: goals.counts.g0,
                g1: goals.counts.g1,
                g2: goals.counts.g2,
                g3: goals.counts.g3
              }
            )}
          </span>
          {goals.candidates_to_approve > 0 ? (
            <Badge variant="outline">
              {translate(
                'auto.components.trivium.TriviumGoalsSection.candidatesToApprove',
                '{{count}} to approve',
                { count: goals.candidates_to_approve }
              )}
            </Badge>
          ) : null}
        </div>
      }
      isEmpty={goals.nodes.length === 0}
      emptyLabel={translate(
        'auto.components.trivium.TriviumGoalsSection.empty',
        'No Goals yet. Run a Goal interview to adopt one.'
      )}
    >
      <div className="-mx-2">
        {outline.roots.map((root) => (
          <GoalBranch key={root.node.id} branch={root} depth={0} />
        ))}
      </div>
      {outline.dependencies.length > 0 ? (
        <div className="mt-3 border-t border-border/50 pt-2">
          <div className="text-[11px] tracking-[0.05em] text-muted-foreground uppercase">
            {translate('auto.components.trivium.TriviumGoalsSection.dependsOn', 'Depends on')}
          </div>
          <ul className="mt-1 space-y-0.5">
            {outline.dependencies.map((edge) => (
              <li key={edge.id} className="truncate font-mono text-[11px] text-muted-foreground">
                {shortenTriviumId(edge.source)} → {shortenTriviumId(edge.target)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </TriviumSection>
  )
}
