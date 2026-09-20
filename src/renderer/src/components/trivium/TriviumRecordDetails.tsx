import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { isTriviumRecord } from './trivium-workspace-query'

function fieldLabel(key: string): string {
  const words = key.replaceAll('_', ' ').replaceAll('-', ' ')
  return translate(`trivium.inspect.fields.${key}`, words.charAt(0).toUpperCase() + words.slice(1))
}

function recordTitle(value: unknown, index: number): string {
  if (isTriviumRecord(value)) {
    for (const key of ['title', 'name', 'summary', 'id', 'goal_id', 'campaign_id', 'feature_id']) {
      if (typeof value[key] === 'string' && value[key]) {
        return value[key]
      }
    }
  }
  return translate('trivium.inspect.item', 'Item {{number}}', { number: index + 1 })
}

export function TriviumRecordDetails({
  value,
  depth = 0
}: {
  value: unknown
  depth?: number
}): React.JSX.Element {
  if (Array.isArray(value)) {
    if (!value.length) {
      return (
        <p className="text-sm text-muted-foreground">
          {translate('trivium.inspect.noRecords', 'No records.')}
        </p>
      )
    }
    const occurrences = new Map<string, number>()
    return (
      <div className="space-y-3">
        {value.map((item, index) => {
          const title = recordTitle(item, index)
          const identity =
            isTriviumRecord(item) && typeof item.id === 'string' ? item.id : JSON.stringify(item)
          const occurrence = occurrences.get(identity) ?? 0
          occurrences.set(identity, occurrence + 1)
          return (
            <RecordDisclosure
              key={`${identity}:${occurrence}`}
              label={title}
              value={item}
              depth={depth}
            />
          )
        })}
      </div>
    )
  }
  if (isTriviumRecord(value)) {
    const entries = Object.entries(value).filter(([key]) => key !== 'supported' && key !== 'host')
    if (!entries.length) {
      return (
        <p className="text-sm text-muted-foreground">
          {translate('trivium.inspect.noRecords', 'No records.')}
        </p>
      )
    }
    return (
      <div className="space-y-4">
        {entries.map(([key, item]) =>
          typeof item === 'object' && item !== null ? (
            <RecordDisclosure key={key} label={fieldLabel(key)} value={item} depth={depth} />
          ) : (
            <div key={key} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{fieldLabel(key)}</p>
              <TriviumRecordDetails value={item} depth={depth + 1} />
            </div>
          )
        )}
      </div>
    )
  }
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words select-text">
      {value === null || value === undefined || value === '' ? '—' : String(value)}
    </p>
  )
}

function RecordDisclosure({
  label,
  value,
  depth
}: {
  label: string
  value: unknown
  depth: number
}): React.JSX.Element {
  const count = Array.isArray(value) ? value.length : undefined
  return (
    <Collapsible defaultOpen={depth === 0}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-start gap-2 rounded-md p-2 text-left text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          <span className="min-w-0 break-words">{label}</span>
          {count !== undefined ? <span className="text-muted-foreground">{count}</span> : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 border-l border-border py-3 pl-4">
          <TriviumRecordDetails value={value} depth={depth + 1} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
