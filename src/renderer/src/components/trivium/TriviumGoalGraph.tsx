import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  useNodesInitialized,
  useViewport,
  type NodeProps,
  type XYPosition
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './trivium-goal-graph.css'
import type { TriviumGoals } from '../../../../shared/trivium-workspace-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  buildTriviumGoalGraph,
  matchesTriviumGraphFilter,
  type TriviumFlowNode
} from './trivium-goal-graph'
import { triviumGoalStatusBadgeVariant, triviumTierLabel } from './trivium-status-display'
import { TriviumGraphToolbar } from './TriviumGraphToolbar'
import { useTriviumGraphPreferences } from './trivium-graph-preferences'

function GoalNode({ data }: NodeProps<TriviumFlowNode>): React.JSX.Element {
  const { goal } = data
  return (
    <div className="trivium-goal-card w-80 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs">
      <Handle id="contribution-source" type="source" position={Position.Top} />
      <Handle id="contribution-target" type="target" position={Position.Bottom} />
      <Handle id="dependency-source" type="source" position={Position.Right} />
      <Handle id="dependency-target" type="target" position={Position.Left} />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {triviumTierLabel(goal.tier)}
          </span>
          <Badge variant={triviumGoalStatusBadgeVariant(goal.status)}>{goal.status}</Badge>
        </div>
        <div className="trivium-goal-title line-clamp-3 text-base leading-snug font-semibold break-words">
          {goal.title}
        </div>
        <p className="trivium-goal-statement line-clamp-3 text-sm leading-relaxed break-words">
          {goal.statement}
        </p>
      </div>
    </div>
  )
}

function GraphZoom(): React.JSX.Element {
  const { zoom } = useViewport()
  const { zoomTo } = useReactFlow()
  return (
    <Panel position="bottom-right">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void zoomTo(1)}
        aria-label={translate('trivium.graph.actualSize', 'Reset zoom to 100%')}
      >
        {Math.round(zoom * 100)}%
      </Button>
    </Panel>
  )
}

function SelectedGoalViewport({ selectedId }: { selectedId: string | null }): null {
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (initialized && selectedId) {
      void fitView({ nodes: [{ id: selectedId }], minZoom: 1, maxZoom: 1, padding: 0.2 })
    }
  }, [initialized, selectedId, fitView])
  return null
}

const nodeTypes = { goal: GoalNode }

export function TriviumGoalGraph({
  goals,
  selectedId,
  onSelect
}: {
  goals: TriviumGoals
  selectedId: string | null
  onSelect: (id: string | null) => void
}): React.JSX.Element {
  const [{ filter: preferredFilter, textSize }, updatePreferences] = useTriviumGraphPreferences()
  const selectedGoal = goals.nodes.find((node) => node.id === selectedId)
  const filter =
    selectedGoal && !matchesTriviumGraphFilter(selectedGoal, preferredFilter)
      ? 'all'
      : preferredFilter
  const graph = useMemo(
    () => buildTriviumGoalGraph(goals, filter, textSize),
    [goals, filter, textSize]
  )
  const [positions, setPositions] = useState<Record<string, XYPosition>>({})
  const nodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        position: positions[node.id] ?? node.position
      })),
    [graph.nodes, positions, selectedId]
  )
  const firstNode = graph.nodes.reduce<TriviumFlowNode | undefined>(
    (first, node) => (!first || node.position.y < first.position.y ? node : first),
    undefined
  )

  return (
    <div className="flex h-full min-h-0 flex-col" data-text-size={textSize}>
      <TriviumGraphToolbar
        filter={filter}
        textSize={textSize}
        visibleCount={nodes.length}
        totalCount={new Set(goals.nodes.map((node) => node.id)).size}
        onFilter={(next) => {
          updatePreferences({ filter: next })
          setPositions({})
          const selected = goals.nodes.find((node) => node.id === selectedId)
          if (selected && !matchesTriviumGraphFilter(selected, next)) {
            onSelect(null)
          }
        }}
        onTextSize={(next) => {
          updatePreferences({ textSize: next })
          setPositions({})
        }}
      />
      <div className="flex min-h-0 flex-1">
        {!nodes.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
            {goals.nodes.length ? (
              <>
                <p>{translate('trivium.graph.noMatches', 'No goals match this filter.')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updatePreferences({ filter: 'all' })}
                >
                  {translate('trivium.graph.all', 'All goals')}
                </Button>
              </>
            ) : (
              translate(
                'auto.components.trivium.TriviumGoalsSection.empty',
                'No Goals yet. Run a Goal interview to adopt one.'
              )
            )}
          </div>
        ) : (
          <ReactFlow<TriviumFlowNode>
            key={`${filter}:${textSize}`}
            className="trivium-goal-graph"
            nodes={nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => {
              for (const change of changes) {
                if (change.type === 'position' && change.position) {
                  const position = change.position
                  setPositions((previous) => ({ ...previous, [change.id]: position }))
                }
                if (change.type === 'select' && change.selected) {
                  onSelect(change.id)
                }
              }
            }}
            onNodeClick={(_, node) => onSelect(node.id)}
            onPaneClick={() => onSelect(null)}
            nodesConnectable={false}
            edgesReconnectable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            minZoom={0.15}
            maxZoom={2}
            panOnScroll
            zoomOnScroll={false}
            defaultViewport={{
              x: 32 - (firstNode?.position.x ?? 0),
              y: 32 - (firstNode?.position.y ?? 0),
              zoom: 1
            }}
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            ariaLabelConfig={{
              'node.a11yDescription.default': translate(
                'trivium.graph.keyboardSelect',
                'Press Enter or Space to select a node.'
              ),
              'node.a11yDescription.keyboardDisabled': translate(
                'trivium.graph.keyboardMove',
                'Press Enter or Space to select a node, then use arrow keys to move it.'
              )
            }}
          >
            <Background color="var(--border)" gap={20} />
            <Controls showInteractive={false} />
            <GraphZoom />
            <SelectedGoalViewport selectedId={selectedId} />
          </ReactFlow>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          {translate(
            'trivium.graph.readingOrder',
            'Top to bottom: Purpose → Outcome → Capability → Ticket'
          )}
        </span>
        <span>
          {translate('trivium.graph.edgeLegend', 'Solid: contributes to · Dashed: depends on')}
        </span>
      </div>
    </div>
  )
}
