import { useState } from 'react'
import type { TriviumWorkspaceStatus } from '../../../../shared/trivium-workspace-status'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { TriviumGoalGraph } from './TriviumGoalGraph'
import { TriviumGoalDetails } from './TriviumGoalDetails'
import { TriviumGoalList } from './TriviumGoalList'
import { TriviumProjectionPanel } from './TriviumProjectionPanel'
import { Button } from '@/components/ui/button'
import { TriviumSessionPanel } from './TriviumSessionPanel'
import { useTriviumSession } from './use-trivium-session'
import { TriviumCampaignsSection } from './TriviumCampaignsSection'
import { TriviumEscalationsSection } from './TriviumEscalationsSection'
import { TriviumHistorySection } from './TriviumHistorySection'
import { TriviumInterviewsSection } from './TriviumInterviewsSection'
import { TriviumMilestoneSection } from './TriviumMilestoneSection'
import { TriviumTicketsSection } from './TriviumTicketsSection'

export function TriviumWorkspaceView({
  data,
  workspaceId,
  sessionKey
}: {
  data: TriviumWorkspaceStatus
  workspaceId: string
  sessionKey: string
}): React.JSX.Element {
  const [view, setView] = useState('graph')
  const [panel, setPanel] = useState('inspect')
  const [ticketGoal, setTicketGoal] = useState<string>()
  const [campaignId, setCampaignId] = useState<string>()
  const [trail, setTrail] = useState<string[]>([])
  const controller = useTriviumSession(workspaceId, sessionKey)
  const goal = data.goals.nodes.find((node) => node.id === controller.session.selectedId) ?? null
  const selectGoal = (id: string | null): void => {
    if (id && goal && id !== goal.id) {
      setTrail((previous) => (previous.at(-1) === goal.id ? previous : [...previous, goal.id]))
    }
    controller.update({ selectedId: id })
    setPanel('inspect')
  }
  const showTickets = (id?: string): void => {
    setTicketGoal(id)
    setView('tickets')
  }
  const showProgress = (id?: string): void => {
    setCampaignId(id)
    setView('progress')
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Tabs value={view} onValueChange={setView} className="min-h-0 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <div className="max-w-full overflow-x-auto scrollbar-sleek">
            <TabsList>
              <TabsTrigger value="graph">
                {translate('trivium.graph.title', 'Goal graph')}
              </TabsTrigger>
              <TabsTrigger value="goals">
                {translate('trivium.inspect.goalList', 'Goal list')}
              </TabsTrigger>
              <TabsTrigger value="details">
                {translate('trivium.graph.details', 'Workspace details')}
              </TabsTrigger>
              <TabsTrigger value="tickets">
                {translate('trivium.inspect.tickets', 'Ticket details')}
              </TabsTrigger>
              <TabsTrigger value="progress">
                {translate('trivium.inspect.progress', 'Progress details')}
              </TabsTrigger>
            </TabsList>
          </div>
          <span className="text-xs text-muted-foreground">
            {translate('trivium.graph.count', '{{count}} goals', {
              count: data.goals.nodes.length
            })}
          </span>
        </div>
        <TabsContent value="graph" forceMount className="min-h-0 data-[state=inactive]:hidden">
          <TriviumGoalGraph
            goals={data.goals}
            selectedId={goal?.id ?? null}
            onSelect={selectGoal}
          />
        </TabsContent>
        <TabsContent value="goals" className="min-h-0 overflow-hidden">
          <TriviumGoalList goals={data.goals} selectedId={goal?.id ?? null} onSelect={selectGoal} />
        </TabsContent>
        <TabsContent value="tickets" className="min-h-0 overflow-hidden">
          <TriviumProjectionPanel
            key={ticketGoal ?? 'all'}
            workspaceId={workspaceId}
            query={{ kind: 'tickets', under: ticketGoal }}
            onClearScope={() => setTicketGoal(undefined)}
          />
        </TabsContent>
        <TabsContent value="progress" className="min-h-0 overflow-hidden">
          <TriviumProjectionPanel
            key={campaignId ?? 'all'}
            workspaceId={workspaceId}
            query={{ kind: 'progress', campaign: campaignId }}
            onClearScope={() => setCampaignId(undefined)}
          />
        </TabsContent>
        <TabsContent value="details" className="min-h-0 overflow-hidden">
          <div className="h-full space-y-3 overflow-y-auto p-4 scrollbar-sleek">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => showTickets()}>
                {translate('trivium.inspect.browseTickets', 'Browse all ticket records')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => showProgress()}>
                {translate('trivium.inspect.browseProgress', 'Read full progress')}
              </Button>
            </div>
            <TriviumTicketsSection tickets={data.tickets} onSelectGoal={selectGoal} />
            <TriviumCampaignsSection
              campaigns={data.campaigns}
              onSelectGoal={selectGoal}
              onProgress={showProgress}
            />
            <TriviumMilestoneSection milestone={data.milestone} />
            <TriviumEscalationsSection escalations={data.escalations} />
            <TriviumInterviewsSection interviews={data.interviews} />
            <TriviumHistorySection
              history={data.history}
              theoryNodes={data.theory_nodes}
              warnings={data.warnings}
            />
          </div>
        </TabsContent>
      </Tabs>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-border lg:w-96 lg:flex-none lg:border-t-0 lg:border-l xl:w-[28rem]">
        <Tabs value={panel} onValueChange={setPanel} className="min-h-0 flex-1">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <TabsList>
              <TabsTrigger value="inspect">
                {translate('trivium.inspect.goalDetails', 'Goal details')}
              </TabsTrigger>
              <TabsTrigger value="session">
                {translate('trivium.session.title', 'Session')}
              </TabsTrigger>
            </TabsList>
            {panel === 'inspect' && trail.length ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  controller.update({ selectedId: trail.at(-1) ?? null })
                  setTrail((previous) => previous.slice(0, -1))
                }}
              >
                {translate('trivium.inspect.back', 'Previous goal')}
              </Button>
            ) : null}
          </div>
          <TabsContent value="inspect" className="min-h-0 overflow-hidden">
            <div key={goal?.id ?? 'none'} className="h-full overflow-y-auto scrollbar-sleek">
              <TriviumGoalDetails
                goal={goal}
                data={data}
                onSelect={selectGoal}
                onTickets={showTickets}
                onProgress={showProgress}
              />
            </div>
          </TabsContent>
          <TabsContent
            value="session"
            className="flex min-h-0 flex-col data-[state=inactive]:hidden"
          >
            <TriviumSessionPanel
              controller={controller}
              goal={goal}
              goals={data.goals}
              workspaceId={workspaceId}
              workspacePath={data.requested_path}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
