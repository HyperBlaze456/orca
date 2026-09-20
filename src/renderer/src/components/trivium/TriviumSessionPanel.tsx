import { useEffect, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { TriviumSessionTerminal } from './TriviumSessionTerminal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { triviumSessionTargetKey } from './trivium-session-state'
import type { TriviumGoalNode, TriviumGoals } from '../../../../shared/trivium-workspace-status'
import { buildTriviumNodePrompt } from './trivium-goal-graph'
import type { useTriviumSession } from './use-trivium-session'

export function TriviumSessionPanel({
  controller,
  goal,
  goals,
  workspaceId,
  workspacePath
}: {
  controller: ReturnType<typeof useTriviumSession>
  goal: TriviumGoalNode | null
  goals: TriviumGoals
  workspaceId: string
  workspacePath: string
}): React.JSX.Element {
  const { session, targets, selectTarget, previewPtyId, canSend, disabledReason, send, update } =
    controller
  const closeTriviumPage = useAppStore((s) => s.closeTriviumPage)
  const selectedKey = session.target ? triviumSessionTargetKey(session.target) : ''
  const [showSending, setShowSending] = useState(false)
  useEffect(() => {
    if (!session.sending) {
      setShowSending(false)
      return
    }
    const timer = setTimeout(() => setShowSending(true), 200)
    return () => clearTimeout(timer)
  }, [session.sending])
  return (
    <section
      className="flex min-h-0 flex-1 flex-col border-t border-border"
      aria-label={translate('trivium.session.title', 'Session')}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <Label htmlFor="trivium-session">{translate('trivium.session.title', 'Session')}</Label>
        <Select
          value={selectedKey}
          onValueChange={selectTarget}
          disabled={session.sending || !targets.length}
        >
          <SelectTrigger id="trivium-session" size="sm">
            <SelectValue
              placeholder={translate('trivium.session.choose', 'Choose an agent session')}
            />
          </SelectTrigger>
          <SelectContent>
            {selectedKey &&
            !targets.some((target) => triviumSessionTargetKey(target) === selectedKey) ? (
              <SelectItem value={selectedKey} disabled>
                {session.target?.title}
              </SelectItem>
            ) : null}
            {targets.map((target) => (
              <SelectItem
                key={triviumSessionTargetKey(target)}
                value={triviumSessionTargetKey(target)}
              >
                {target.tabTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {translate('trivium.session.continuity', 'Node requests continue in this session.')}
        </span>
      </div>
      {previewPtyId && session.target ? (
        <TriviumSessionTerminal
          target={session.target}
          workspaceId={workspaceId}
          workspacePath={workspacePath}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {session.target
              ? translate(
                  'trivium.session.unavailable',
                  'This session is unavailable. Reconnect or choose another session.'
                )
              : translate(
                  'trivium.session.empty',
                  'Start an agent in this workspace to continue here.'
                )}
          </p>
          <Button variant="outline" size="sm" onClick={closeTriviumPage}>
            {translate('trivium.session.openWorkspace', 'Open workspace')}
          </Button>
        </div>
      )}
      <form
        aria-busy={session.sending}
        className="space-y-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSend && session.draft.trim()) {
            void send(goal ? buildTriviumNodePrompt(goal, goals, session.draft) : session.draft)
          }
        }}
      >
        {goal ? (
          <div className="space-y-1">
            <p className="text-xs font-medium">{goal.title}</p>
            <p className="line-clamp-3 text-xs text-muted-foreground">{goal.statement}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{goal.id}</p>
          </div>
        ) : null}
        <Label htmlFor="trivium-request">
          {translate('trivium.session.request', 'What should change?')}
        </Label>
        <Textarea
          id="trivium-request"
          rows={2}
          value={session.draft}
          disabled={session.sending}
          onChange={(event) => update({ draft: event.target.value })}
        />
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted-foreground">
            {session.error ?? disabledReason}
          </p>
          <Button type="submit" size="sm" disabled={!canSend || !session.draft.trim()}>
            {showSending ? <Loader2 className="size-4 animate-spin" /> : <Send />}
            {translate('trivium.session.send', 'Send to session')}
          </Button>
        </div>
      </form>
    </section>
  )
}
