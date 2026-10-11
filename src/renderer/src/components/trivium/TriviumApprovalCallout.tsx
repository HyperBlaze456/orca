import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { triviumApprovalRequest } from './trivium-composer-prompt'
import type { TriviumModel } from './trivium-goal-model'
import { triviumCommandPlaceholders } from './trivium-terminal-command-insert'
import { useTriviumTerminalControls } from './trivium-terminal-panel-state'
import { TriviumTicketStatusIcon } from './TriviumIcons'
import { TriviumReaderCopyButton } from './TriviumReaderButtons'
import { TriviumRichText } from './TriviumRichText'
import { TriviumPasteIntoTerminalButton } from './TriviumTerminalButtons'

/**
 * A proposed ticket waits for the user. The page never approves: "Paste into terminal" puts the
 * command in the page's shell without Enter, "Ask the agent to approve" only writes the request
 * into the composer, and the user still presses Enter or Send.
 */
export function TriviumApprovalCallout({
  model,
  id,
  onAskAgent
}: {
  model: TriviumModel
  id: string
  onAskAgent: (draft: string) => void
}): React.JSX.Element {
  const parent = model.parent(id)
  const hypothesis = model.proposal(id)?.hypothesis ?? ''
  const command = model.approveCommand(id)
  const placeholders = command ? triviumCommandPlaceholders(command) : []
  const { timedOutText } = useTriviumTerminalControls()
  return (
    <div
      data-trivium-approval=""
      className="mt-4 rounded-xl border border-trivium-decision/30 bg-trivium-decision/10 px-4 py-3.5"
    >
      <h3 className="flex items-center gap-2 text-[13px] font-semibold">
        <TriviumTicketStatusIcon kind="approval" />
        {translate('trivium.approval.title', 'Waiting for your approval')}
      </h3>
      <p className="mt-1.5 text-[13px] leading-5 break-keep wrap-anywhere">
        {parent
          ? translate(
              'trivium.approval.explainUnder',
              'Approving adopts this proposed ticket under “{{parent}}”. Until then it is not part of the Goal model.',
              { parent: model.title(parent) }
            )
          : translate(
              'trivium.approval.explain',
              'Approving adopts this proposed ticket. Until then it is not part of the Goal model.'
            )}
      </p>
      {hypothesis ? (
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground break-keep wrap-anywhere">
          <span className="font-medium text-foreground">
            {translate('trivium.approval.why', 'Why it was proposed.')}
          </span>{' '}
          <TriviumRichText inline text={hypothesis} />
        </p>
      ) : null}
      {command ? (
        <code
          data-trivium-approve-command=""
          className="mt-2.5 block rounded-md bg-muted px-2 py-1.5 font-mono text-[11.5px] leading-[18px] break-all"
        >
          {command}
        </code>
      ) : null}
      {placeholders.length > 0 ? (
        <p data-trivium-approve-placeholders="" className="mt-1.5 text-xs text-muted-foreground">
          {translate(
            'trivium.approval.placeholderHint',
            'Replace {{placeholders}} before you press Enter.',
            { placeholders: placeholders.join(', ') }
          )}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {command ? <TriviumPasteIntoTerminalButton command={command} /> : null}
        <Button
          size="xs"
          variant={command ? 'outline' : 'default'}
          onClick={() => onAskAgent(triviumApprovalRequest(model, id))}
        >
          {translate('trivium.approval.ask', 'Ask the agent to approve')}
        </Button>
        {command ? (
          <TriviumReaderCopyButton
            text={command}
            label={translate('trivium.approval.copyCommand', 'Copy command')}
          />
        ) : null}
      </div>
      {command && timedOutText === command ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {translate(
            'trivium.approval.pasteTimeout',
            "The terminal didn't start in time. Try again, or copy the command."
          )}
        </p>
      ) : null}
    </div>
  )
}
