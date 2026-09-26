import type { ComponentProps, ReactNode } from 'react'
import { GitMerge } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { shortTriviumSha } from './trivium-harness-text'

export type TriviumReaderPillTone = 'default' | 'blocked' | 'decision' | 'new'

type PillProps = {
  /** Test hook: `data-trivium-pill`. */
  name?: string
  size?: 'md' | 'sm'
  tone?: TriviumReaderPillTone
  className?: string
  children: ReactNode
}

// Why raw spans: a pill is a property read-out, and Badge owns its spacing and colors.
function pillClasses(size: 'md' | 'sm', tone: TriviumReaderPillTone): string {
  return cn(
    'inline-flex max-w-full min-w-0 shrink-0 items-center rounded-full border border-border bg-background whitespace-nowrap dark:border-input dark:bg-input/30',
    size === 'md' ? 'h-6 gap-1.5 px-2.5 text-xs' : 'h-5 gap-1 px-2 text-[11.5px]',
    tone === 'blocked' && 'text-trivium-blocked',
    tone === 'decision' && 'text-trivium-decision',
    tone === 'new' && 'text-trivium-new'
  )
}

export function TriviumReaderPill({
  name,
  size = 'md',
  tone = 'default',
  className,
  children
}: PillProps): React.JSX.Element {
  return (
    <span data-trivium-pill={name} className={cn(pillClasses(size, tone), className)}>
      {children}
    </span>
  )
}

export function TriviumReaderPillButton({
  name,
  size = 'md',
  tone = 'default',
  className,
  children,
  ...props
}: PillProps &
  Omit<ComponentProps<'button'>, 'className' | 'children' | 'name'>): React.JSX.Element {
  return (
    <button
      type="button"
      data-trivium-pill={name}
      {...props}
      className={cn(
        pillClasses(size, tone),
        'cursor-pointer hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        className
      )}
    >
      {children}
    </button>
  )
}

/** The text part of a pill: truncates instead of widening the row. */
export function TriviumReaderPillText({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="min-w-0 truncate">{children}</span>
}

/** Merge icon and short sha; the tooltip carries the full commit. */
export function TriviumReaderCommitPill({ commit }: { commit: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-trivium-commit={commit} className={pillClasses('sm', 'default')}>
          <GitMerge aria-hidden="true" className="size-3 shrink-0 text-trivium-done" />
          <span className="font-mono text-[11px]">{shortTriviumSha(commit)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {translate('trivium.reader.mergedCommit', 'Merged {{commit}}', { commit })}
      </TooltipContent>
    </Tooltip>
  )
}
