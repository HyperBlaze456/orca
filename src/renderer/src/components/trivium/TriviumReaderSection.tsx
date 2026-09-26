import { useId, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatTriviumCount } from './trivium-reader-text'

/**
 * An unframed reader section: 13px heading, muted count and a hairline. `name` is a stable
 * hook for tests and anchors; `anchor` marks the target of a route anchor such as `updates`.
 */
export function TriviumReaderSection({
  name,
  title,
  count,
  end,
  anchor,
  children
}: {
  name: string
  title: string
  count?: number
  end?: ReactNode
  anchor?: string
  children: ReactNode
}): React.JSX.Element {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      data-trivium-section={name}
      data-trivium-anchor={anchor}
      className="mt-7 scroll-mt-4"
    >
      <h3 className="mb-2 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-1.5 text-[13px] font-semibold">
        <span id={titleId}>{title}</span>
        {count === undefined ? null : (
          <span className="font-normal text-muted-foreground tabular-nums">
            {formatTriviumCount(count)}
          </span>
        )}
        {end ? (
          <span className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5 font-normal">
            {end}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  )
}

export function TriviumReaderSubheading({
  icon,
  title,
  count
}: {
  icon?: ReactNode
  title: string
  count: number
}): React.JSX.Element {
  return (
    <h4 className="mt-4 mb-1 flex items-center gap-1.5 text-xs font-semibold">
      {icon}
      {title}
      <span className="font-medium text-muted-foreground tabular-nums">
        {formatTriviumCount(count)}
      </span>
    </h4>
  )
}

export type TriviumReaderFact = { label: string; value: ReactNode }

export function TriviumReaderFacts({ facts }: { facts: TriviumReaderFact[] }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs leading-[18px]">
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5 wrap-anywhere">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A quiet folded block at the end of a page ("Technical details", "Workspace details"). */
export function TriviumReaderDisclosure({
  name,
  label,
  children
}: {
  name: string
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div data-trivium-section={name} className="mt-7 border-t border-border pt-3.5">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
            />
            {label}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-3">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
