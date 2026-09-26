import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import type { TriviumTreeEntry } from './trivium-goal-tree'
import type { TriviumReaderLoadState } from './trivium-reader-load'
import { useTriviumSessionState } from './trivium-session-state'
import { TriviumComposer } from './TriviumComposer'
import { TriviumGoalPage } from './TriviumGoalPage'
import { TRIVIUM_UPDATES_ANCHOR } from './TriviumGoalPageMilestones'
import { TriviumOverview } from './TriviumOverview'
import { TriviumTicketListPage } from './TriviumTicketListPage'
import { TriviumTicketPage } from './TriviumTicketPage'
import type { TriviumNavigation, TriviumRoute } from './use-trivium-navigation'

export type { TriviumLoadState, TriviumReaderLoadState } from './trivium-reader-load'

export type TriviumReaderProps = {
  model: TriviumModel
  entries: readonly TriviumTreeEntry[]
  navigation: TriviumNavigation
  /** "Since your last visit" markers by id (`useTriviumChangeMarkers(...).changes`). */
  changes: ReadonlyMap<string, TriviumChange>
  loadState: TriviumReaderLoadState
  workspaceId: string
  /** Key of the agent session and composer draft (`useTriviumSession`). */
  sessionKey: string
}

function MissingItem({ navigation }: { navigation: TriviumNavigation }): React.JSX.Element {
  return (
    <div data-trivium-page="missing" className="mx-auto mt-[12vh] max-w-[460px] text-center">
      <p className="text-sm font-semibold">
        {translate('trivium.reader.missing', 'This item is no longer in the Goal model')}
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={navigation.openOverview}>
        {translate('trivium.reader.backToOverview', 'Back to Overview')}
      </Button>
    </div>
  )
}

/** Resets scroll on every route change; an `updates` anchor lands on the milestone section. */
function useRouteScroll(route: TriviumRoute): React.RefObject<HTMLDivElement | null> {
  const scroller = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<TriviumRoute | null>(null)
  const anchoredFor = useRef<TriviumRoute | null>(null)
  // Runs after every render: the anchor may only exist once progress has loaded.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    if (scrolledFor.current !== route) {
      scrolledFor.current = route
      element.scrollTop = 0
    }
    if (route.view !== 'item' || route.anchor !== 'updates' || anchoredFor.current === route) {
      return
    }
    const target = element.querySelector(`[data-trivium-anchor="${TRIVIUM_UPDATES_ANCHOR}"]`)
    if (target) {
      anchoredFor.current = route
      target.scrollIntoView({ block: 'start' })
    }
  })
  return scroller
}

/**
 * The right-hand reader of the Trivium page: Overview, ticket list, Goal page or Ticket page
 * by route, in one scroll container, with the composer pinned under Goal and Ticket pages.
 * Every link goes through `navigation`.
 */
export function TriviumReader({
  model,
  entries,
  navigation,
  changes,
  loadState,
  workspaceId,
  sessionKey
}: TriviumReaderProps): React.JSX.Element {
  const { route } = navigation
  const scroller = useRouteScroll(route)
  const composerInput = useRef<HTMLTextAreaElement>(null)
  const updateSession = useTriviumSessionState((state) => state.update)

  // The list highlights the ticket the user opened last, including after going back.
  const openedTicket = route.view === 'item' && model.isTicket(route.id) ? route.id : null
  const lastTicket = useRef<string | null>(null)
  useEffect(() => {
    if (openedTicket) {
      lastTicket.current = openedTicket
    }
  }, [openedTicket])
  const currentTicketId = openedTicket ?? lastTicket.current

  const askAgent = useCallback(
    (draft: string) => {
      if (useTriviumSessionState.getState().sessions[sessionKey]?.sending) {
        return
      }
      updateSession(sessionKey, { draft, error: null })
      composerInput.current?.focus()
    },
    [sessionKey, updateSession]
  )

  let page: ReactNode
  let composerItem: string | null = null
  if (route.view === 'overview') {
    page = (
      <TriviumOverview
        model={model}
        entries={entries}
        navigation={navigation}
        changes={changes}
        loadState={loadState}
      />
    )
  } else if (route.view === 'tickets') {
    page =
      route.parentId !== null && !model.isShown(route.parentId) ? (
        <MissingItem navigation={navigation} />
      ) : (
        <TriviumTicketListPage
          key={route.parentId ?? ''}
          model={model}
          entries={entries}
          navigation={navigation}
          changes={changes}
          loadState={loadState}
          parentId={route.parentId}
          currentTicketId={currentTicketId}
        />
      )
  } else if (!model.isShown(route.id)) {
    page = <MissingItem navigation={navigation} />
  } else if (model.isTicket(route.id)) {
    composerItem = route.id
    page = (
      <TriviumTicketPage
        key={route.id}
        model={model}
        id={route.id}
        entries={entries}
        navigation={navigation}
        changes={changes}
        loadState={loadState}
        onAskAgent={askAgent}
      />
    )
  } else {
    composerItem = route.id
    page = (
      <TriviumGoalPage
        key={route.id}
        model={model}
        id={route.id}
        entries={entries}
        navigation={navigation}
        changes={changes}
        loadState={loadState}
        currentTicketId={currentTicketId}
      />
    )
  }

  return (
    <section
      aria-label={translate('trivium.reader.label', 'Reader')}
      data-trivium-reader=""
      className="@container/reader flex h-full min-h-0 min-w-0 flex-1 flex-col"
    >
      <div
        ref={scroller}
        data-trivium-reader-scroll=""
        className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
      >
        <article
          className={cn(
            'mx-auto px-6 pt-6 pb-14 @min-[720px]/reader:px-10',
            route.view === 'overview' ? 'max-w-[780px]' : 'max-w-[860px]'
          )}
        >
          {page}
        </article>
      </div>
      {composerItem ? (
        <TriviumComposer
          model={model}
          itemId={composerItem}
          workspaceId={workspaceId}
          sessionKey={sessionKey}
          inputRef={composerInput}
          loadState={loadState}
        />
      ) : null}
    </section>
  )
}
