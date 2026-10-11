import { SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  triviumTerminalUnavailableText,
  useTriviumTerminalControls,
  type TriviumTerminalAvailability
} from './trivium-terminal-panel-state'

/** The header's terminal toggle; weighs the same as Refresh beside it. */
export function TriviumTerminalToggle({
  open,
  availability,
  onToggle
}: {
  open: boolean
  availability: TriviumTerminalAvailability
  onToggle: () => void
}): React.JSX.Element {
  const label = translate('trivium.terminal.title', 'Terminal')
  const tip = !availability.available
    ? triviumTerminalUnavailableText(availability)
    : open
      ? translate('trivium.terminal.hide', 'Hide terminal')
      : label
  const button = (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={open}
      disabled={!availability.available}
      data-trivium-terminal-toggle=""
      onClick={onToggle}
    >
      <SquareTerminal aria-hidden="true" className="size-3.5" />
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Why the span: a disabled button gets no pointer or focus events, so its tooltip never opens. */}
        {availability.available ? (
          button
        ) : (
          <span tabIndex={0} className="inline-flex">
            {button}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}

/** The callout's primary action: opens the panel and pastes the command without Enter. */
export function TriviumPasteIntoTerminalButton({
  command
}: {
  command: string
}): React.JSX.Element {
  const { availability, requestPaste } = useTriviumTerminalControls()
  const button = (
    <Button
      size="xs"
      disabled={!availability.available}
      data-trivium-paste-command=""
      onClick={() => requestPaste(command)}
    >
      <SquareTerminal aria-hidden="true" />
      {translate('trivium.approval.paste', 'Paste into terminal')}
    </Button>
  )
  if (availability.available) {
    return button
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {triviumTerminalUnavailableText(availability)}
      </TooltipContent>
    </Tooltip>
  )
}
