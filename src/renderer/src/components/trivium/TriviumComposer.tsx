import { useEffect, useState, type RefObject } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { selectFloatingTerminalTriggerVisible } from '@/components/floating-terminal/floating-terminal-trigger-visibility'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import {
  isImeOwnedKeyboardEvent,
  useImeEnterGestureOwnership
} from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  buildTriviumComposerPrompt,
  describeTriviumItemForAgent,
  triviumComposerChips
} from './trivium-composer-prompt'
import type { TriviumModel } from './trivium-goal-model'
import {
  TRIVIUM_DETAILS_LOADED,
  triviumWorkLoadState,
  type TriviumDetailStates
} from './trivium-reader-load'
import {
  buildTriviumComposerTargetItems,
  findTriviumNewSessionAgent,
  resolveTriviumNewSessionChoice
} from './trivium-new-session-targets'
import { triviumSessionTargetKey, useTriviumSessionState } from './trivium-session-state'
import { TriviumTicketStatusIcon } from './TriviumIcons'
import { TriviumReaderWorkRing } from './TriviumReaderWorkRing'
import { TriviumRichText } from './TriviumRichText'
import { useTriviumAgentLaunch } from './use-trivium-agent-launch'
import { useTriviumSession } from './use-trivium-session'

// Why: fast local sends show nothing; SSH round trips get a spinner after this delay.
const SENDING_FEEDBACK_DELAY_MS = 200

/**
 * Sends a request about the Goal or ticket on screen to an agent session, or starts a new one in
 * the workspace with it. The item context is captured when Send is pressed; the page itself
 * changes nothing in the harness.
 */
export function TriviumComposer({
  model,
  itemId,
  workspaceId,
  sessionKey,
  inputRef,
  loadState = TRIVIUM_DETAILS_LOADED
}: {
  model: TriviumModel
  itemId: string
  workspaceId: string
  sessionKey: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  /** Keeps the context icon and the prompt from reading missing records as open or undone. */
  loadState?: TriviumDetailStates
}): React.JSX.Element {
  const {
    session,
    targets,
    selectTarget,
    selectNewSession,
    send,
    canSend,
    disabledReason,
    update
  } = useTriviumSession(workspaceId, sessionKey)
  const { newSessionGroup, launch } = useTriviumAgentLaunch(workspaceId, sessionKey)
  const imeEnterGesture = useImeEnterGestureOwnership()
  const floatingTriggerShown = useAppStore(selectFloatingTerminalTriggerVisible)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [showSending, setShowSending] = useState(false)

  useEffect(() => {
    if (!session.sending) {
      setShowSending(false)
      return
    }
    const timer = window.setTimeout(() => setShowSending(true), SENDING_FEEDBACK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [session.sending])

  const isTicket = model.isTicket(itemId)
  const draft = session.draft
  const newSessionChoice = resolveTriviumNewSessionChoice({
    chosen: session.newSessionAgent,
    hasSessions: targets.length > 0,
    group: newSessionGroup
  })
  const selectedKey = newSessionChoice
    ? newSessionChoice.key
    : session.target
      ? triviumSessionTargetKey(session.target)
      : ''
  const items = buildTriviumComposerTargetItems(targets, newSessionGroup)
  const canSubmit = newSessionChoice ? !session.sending : canSend

  const submit = async (): Promise<void> => {
    if (!canSubmit || !draft.trim()) {
      return
    }
    // Frozen here: navigating while the request is in flight does not change what was sent.
    const prompt = buildTriviumComposerPrompt(
      describeTriviumItemForAgent(model, itemId, loadState),
      draft
    )
    setSentTo(null)
    if (newSessionChoice) {
      await launch(newSessionChoice, prompt)
      return
    }
    const agent = session.target?.title ?? ''
    await send(prompt)
    const after = useTriviumSessionState.getState().sessions[sessionKey]
    if (after && !after.sending && !after.error && after.draft === '') {
      setSentTo(agent)
    }
  }

  const note = session.error ? (
    <span className="text-destructive">{session.error}</span>
  ) : session.notice ? (
    session.notice
  ) : sentTo !== null && !draft ? (
    translate('trivium.composer.sent', 'Sent to {{agent}}', { agent: sentTo })
  ) : newSessionChoice ? (
    ''
  ) : (
    (disabledReason ?? '')
  )

  return (
    <div
      data-trivium-composer=""
      className={cn(
        'shrink-0 border-t border-border bg-background px-4 pt-3 pb-3.5',
        // Why: the floating-terminal trigger defaults to 24px + 36px from the right edge, level with Send.
        floatingTriggerShown && 'pr-[72px]'
      )}
    >
      <div className="mx-auto max-w-[860px] @min-[720px]/reader:px-6">
        <div className="rounded-[10px] border border-input bg-transparent px-2.5 py-2 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
          <div
            data-trivium-composer-context=""
            className="mb-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          >
            {!isTicket ? (
              <TriviumReaderWorkRing
                state={triviumWorkLoadState(loadState, model.work(itemId))}
                size={12}
                fraction={model.work(itemId).fraction}
              />
            ) : loadState.tickets === 'ready' ? (
              <TriviumTicketStatusIcon size={12} kind={model.ticketKind(itemId)} />
            ) : null}
            <span className="shrink-0">
              {isTicket
                ? translate('trivium.composer.ticket', 'Ticket')
                : translate('trivium.composer.goal', '{{tier}} goal', {
                    tier: (model.node(itemId)?.tier ?? '').toUpperCase()
                  })}
            </span>
            <span className="min-w-0 truncate text-foreground">
              <TriviumRichText inline text={model.title(itemId)} />
            </span>
          </div>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={session.sending}
            aria-label={translate('trivium.composer.input', 'Message to the agent')}
            placeholder={
              isTicket
                ? translate(
                    'trivium.composer.placeholderTicket',
                    'Ask the agent about this ticket…'
                  )
                : translate('trivium.composer.placeholderGoal', 'Ask the agent about this goal…')
            }
            onChange={(event) => update({ draft: event.target.value, error: null, notice: null })}
            onKeyDown={(event) => {
              if (imeEnterGesture.ownsKeyDown(event) || isImeOwnedKeyboardEvent(event)) {
                return
              }
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                event.preventDefault()
                void submit()
              }
            }}
            onKeyUp={imeEnterGesture.onKeyUp}
            onCompositionStart={() => imeEnterGesture.setComposing(true)}
            onCompositionEnd={() => imeEnterGesture.setComposing(false)}
            onBlur={imeEnterGesture.reset}
            className="block max-h-[120px] min-h-[22px] w-full resize-none overflow-y-auto scrollbar-sleek bg-transparent py-px text-[13px] leading-5 outline-none [field-sizing:content] placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {triviumComposerChips(isTicket).map((chip) => (
                <Button
                  key={chip}
                  variant="outline"
                  size="xs"
                  disabled={session.sending}
                  onClick={() => {
                    update({ draft: chip, error: null, notice: null })
                    inputRef.current?.focus()
                  }}
                >
                  {chip}
                </Button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Select
                value={selectedKey}
                onValueChange={(key) => {
                  const option = findTriviumNewSessionAgent(newSessionGroup, key)
                  if (option) {
                    selectNewSession(option.agent)
                  } else {
                    selectTarget(key)
                  }
                }}
                disabled={
                  session.sending || (targets.length === 0 && newSessionGroup.state !== 'ready')
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label={translate('trivium.composer.target', 'Agent session')}
                  className="max-w-44"
                >
                  <SelectValue
                    placeholder={translate('trivium.composer.noTarget', 'No agent session')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {!newSessionChoice &&
                  selectedKey &&
                  !items.sessions.some((item) => item.key === selectedKey) ? (
                    <SelectItem value={selectedKey} disabled>
                      {session.target?.title}
                    </SelectItem>
                  ) : null}
                  {items.sessions.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                  {items.sessions.length > 0 ? <SelectSeparator /> : null}
                  <SelectGroup>
                    <SelectLabel>
                      {translate('trivium.composer.newSessionGroup', 'New session')}
                    </SelectLabel>
                    {items.newSession.map((item) =>
                      item.kind === 'agent' ? (
                        <SelectItem key={item.key} value={item.key}>
                          <AgentIcon agent={item.agent} size={14} />
                          <span className="truncate">
                            {translate('trivium.composer.newSession', 'New {{agent}} session', {
                              agent: item.label
                            })}
                          </span>
                        </SelectItem>
                      ) : (
                        <SelectItem key={item.key} value={item.key} disabled>
                          {item.kind === 'detecting'
                            ? translate('trivium.composer.detectingAgents', 'Detecting agents…')
                            : translate('trivium.composer.noAgentsDetected', 'No agents detected')}
                        </SelectItem>
                      )
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-16"
                aria-busy={session.sending}
                disabled={!canSubmit || !draft.trim()}
                onClick={() => void submit()}
              >
                {showSending ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : null}
                <span className={cn(showSending && 'sr-only')}>
                  {translate('trivium.composer.send', 'Send')}
                </span>
              </Button>
            </div>
          </div>
        </div>
        <p
          role="status"
          data-trivium-composer-note=""
          className="mt-1.5 min-h-[18px] text-xs text-muted-foreground"
        >
          {note}
        </p>
      </div>
    </div>
  )
}
