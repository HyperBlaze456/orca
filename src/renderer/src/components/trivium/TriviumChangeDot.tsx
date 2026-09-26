import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type TriviumChangeDotKind = 'new' | 'changed'

export function triviumChangeDotLabel(kind: TriviumChangeDotKind, description?: string): string {
  if (kind === 'new') {
    return translate('trivium.changeDot.new', 'New since your last visit')
  }
  const detail = description?.trim()
  return detail
    ? translate('trivium.changeDot.changedDetail', 'Changed: {{description}}', {
        description: detail
      })
    : translate('trivium.changeDot.changed', 'Changed since your last visit')
}

/** Blue "since your last visit" marker: filled when new, a ring when changed. */
export function TriviumChangeDot({
  kind,
  description,
  className
}: {
  kind: TriviumChangeDotKind
  description?: string
  className?: string
}): React.JSX.Element {
  const label = triviumChangeDotLabel(kind, description)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          data-trivium-change={kind}
          className={cn(
            'inline-block size-1.75 shrink-0 rounded-full',
            kind === 'new' ? 'bg-trivium-new' : 'border-[1.5px] border-trivium-new',
            className
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
