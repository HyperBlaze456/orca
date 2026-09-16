import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { cn } from '@/lib/utils'

/** One framed block of the Trivium page: title, optional trailing meta, and an empty state. */
export function TriviumSection({
  title,
  meta,
  emptyLabel,
  isEmpty,
  children
}: {
  title: string
  meta?: React.ReactNode
  emptyLabel: string
  isEmpty: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4">
        <CardTitle className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {title}
        </CardTitle>
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      </CardHeader>
      <CardContent className="px-4">
        {isEmpty ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : children}
      </CardContent>
    </Card>
  )
}

/** A label/value pair in the dense metadata grids the sections share. */
export function TriviumFact({
  label,
  children,
  className
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[11px] tracking-[0.05em] text-muted-foreground uppercase">{label}</div>
      <div className="truncate text-xs text-foreground">{children}</div>
    </div>
  )
}

/** A list row matching the table-like rows used by the artifacts and automations pages. */
export function TriviumRow({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 border-b border-border/50 py-2 last:border-b-0',
        className
      )}
    >
      {children}
    </div>
  )
}
