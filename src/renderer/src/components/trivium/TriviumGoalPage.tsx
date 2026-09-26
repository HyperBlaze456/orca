import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { triviumTreeOrder, type TriviumTreeEntry } from './trivium-goal-tree'
import { triviumTierName } from './trivium-harness-text'
import { triviumGoalMilestones, triviumOpenQuestions } from './trivium-milestones'
import { triviumNeedState, type TriviumReaderLoadState } from './trivium-reader-load'
import { formatTriviumCount, triviumTicketsUnderSubGoals } from './trivium-reader-text'
import { sortTriviumTickets } from './trivium-ticket-list-groups'
import { TriviumGoalPageHeader } from './TriviumGoalPageHeader'
import { TriviumGoalPageMilestones } from './TriviumGoalPageMilestones'
import { TriviumGoalCriteria } from './TriviumGoalPageCriteria'
import { TriviumProgressRing } from './TriviumIcons'
import { TriviumGoalOpenQuestions } from './TriviumOpenQuestions'
import { TriviumReaderBreadcrumb } from './TriviumReaderBreadcrumb'
import { TriviumReaderCopyButton, TriviumReaderQuietButton } from './TriviumReaderButtons'
import { TriviumReaderClampedText } from './TriviumReaderClamp'
import { TriviumReaderGoalRows } from './TriviumReaderGoalRows'
import { TriviumReaderPending } from './TriviumReaderPending'
import {
  TriviumReaderDisclosure,
  TriviumReaderFacts,
  TriviumReaderSection
} from './TriviumReaderSection'
import { TriviumInlineCode } from './TriviumRichText'
import { TriviumTicketRows } from './TriviumTicketRows'
import type { TriviumNavigation } from './use-trivium-navigation'

const GOAL_TICKET_PROPERTIES = { id: false, goal: false, commit: true } as const

/**
 * Linear's project overview for a G0–G2 Goal: a short header, then what the Goal gathers (its
 * sub-goals and its own tickets) and its milestones; long prose stays one click deeper.
 */
export function TriviumGoalPage({
  model,
  id,
  entries,
  navigation,
  changes,
  loadState,
  currentTicketId
}: {
  model: TriviumModel
  id: string
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
  currentTicketId: string | null
}): React.JSX.Element {
  const treeOrder = useMemo(() => triviumTreeOrder(entries), [entries])
  const milestones = useMemo(() => triviumGoalMilestones(model, id), [model, id])
  const questions = useMemo(() => triviumOpenQuestions(model, id), [model, id])
  const node = model.node(id)
  const subGoals = model.subGoals(id)
  const direct = useMemo(
    () => sortTriviumTickets(model, model.directTickets(id), 'goal', treeOrder),
    [model, id, treeOrder]
  )
  const descendants = model.descendantTickets(id)
  const ticketsState = triviumNeedState(loadState, ['tickets'])
  const progressState = triviumNeedState(loadState, ['progress'])
  const listed = direct.length > 0 ? direct : descendants
  const listedWork = model.ticketWork(listed)
  const work = model.work(id)
  const ticketsEnd = (
    <>
      {ticketsState === 'ready' ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <TriviumProgressRing fraction={listedWork.fraction} />
          {translate('trivium.goalPage.ticketsDone', '{{done}}/{{total}} done', {
            done: formatTriviumCount(listedWork.done),
            total: formatTriviumCount(listedWork.total)
          })}
        </span>
      ) : null}
      <TriviumReaderQuietButton onClick={() => navigation.openTickets(id)}>
        {translate('trivium.goalPage.openInList', 'Open in list')}
      </TriviumReaderQuietButton>
    </>
  )
  return (
    <div data-trivium-page="goal" data-trivium-item={id}>
      <div className="mb-4 flex min-h-6.5 items-center gap-2.5">
        <TriviumReaderBreadcrumb model={model} id={id} navigation={navigation} />
      </div>
      <TriviumGoalPageHeader
        model={model}
        id={id}
        navigation={navigation}
        changes={changes}
        loadState={loadState}
        ownMilestones={milestones.own}
      />
      {node?.statement.trim() ? (
        <TriviumReaderClampedText
          text={node.statement}
          lines={4}
          className="mt-4"
          textClassName="max-w-[70ch] text-sm leading-[1.7]"
        />
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {translate('trivium.goalPage.noDescription', 'No description recorded.')}
        </p>
      )}
      {progressState === 'ready' ? <TriviumGoalCriteria model={model} id={id} /> : null}
      {subGoals.length > 0 ? (
        <TriviumReaderSection
          name="sub-goals"
          title={translate('trivium.goalPage.subGoals', 'Sub-goals')}
          count={subGoals.length}
        >
          <TriviumReaderGoalRows
            model={model}
            ids={subGoals}
            loadState={loadState}
            navigation={navigation}
          />
        </TriviumReaderSection>
      ) : null}
      {listed.length > 0 ? (
        <TriviumReaderSection
          name="tickets"
          title={translate('trivium.goalPage.tickets', 'Tickets')}
          count={listed.length}
          end={ticketsEnd}
        >
          {direct.length === 0 ? (
            <>
              <p className="text-[13px] text-muted-foreground">
                {triviumTicketsUnderSubGoals(descendants.length)}
              </p>
              <TriviumReaderPending state={ticketsState} need="tickets" onRetry={loadState.retry} />
            </>
          ) : ticketsState === 'ready' ? (
            <TriviumTicketRows
              name="goal"
              model={model}
              ids={direct}
              grouping="status"
              treeOrder={treeOrder}
              properties={GOAL_TICKET_PROPERTIES}
              changes={changes}
              loadState={loadState}
              currentId={currentTicketId}
              onOpen={(ticketId) => navigation.openItem(ticketId)}
            />
          ) : (
            <TriviumReaderPending state={ticketsState} need="tickets" onRetry={loadState.retry} />
          )}
        </TriviumReaderSection>
      ) : ticketsState === 'error' ? (
        // The work pills above may read "—"; say why even without a Tickets section.
        <div data-trivium-section="tickets-pending" className="mt-7">
          <TriviumReaderPending state={ticketsState} need="tickets" onRetry={loadState.retry} />
        </div>
      ) : null}
      {progressState === 'ready' ? (
        <>
          <TriviumGoalPageMilestones
            model={model}
            milestones={milestones}
            contradictions={questions.contradictions}
            navigation={navigation}
          />
          {questions.unknowns.length > 0 ? (
            <TriviumGoalOpenQuestions unknowns={questions.unknowns} />
          ) : null}
        </>
      ) : (
        <div data-trivium-section="progress-pending" className="mt-7">
          <TriviumReaderPending state={progressState} need="progress" onRetry={loadState.retry} />
        </div>
      )}
      <TriviumReaderDisclosure
        name="technical-details"
        label={translate('trivium.reader.technicalDetails', 'Technical details')}
      >
        <TriviumReaderFacts
          facts={[
            {
              label: translate('trivium.reader.id', 'ID'),
              value: (
                <>
                  <TriviumInlineCode className="wrap-anywhere">{id}</TriviumInlineCode>
                  <TriviumReaderCopyButton
                    text={id}
                    label={translate('trivium.reader.copy', 'Copy')}
                  />
                </>
              )
            },
            { label: translate('trivium.reader.status', 'Status'), value: node?.status ?? '—' },
            {
              label: translate('trivium.reader.tier', 'Tier'),
              value: `${(node?.tier ?? '').toUpperCase()} · ${triviumTierName(node?.tier ?? '')}`
            },
            {
              label: translate('trivium.reader.featuresCompleted', 'Features completed'),
              value:
                ticketsState === 'ready' && progressState === 'ready'
                  ? formatTriviumCount(work.completedFeatures)
                  : '—'
            }
          ]}
        />
      </TriviumReaderDisclosure>
    </div>
  )
}
