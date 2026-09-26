import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumMemoryDelta } from './trivium-progress-records'
import { formatTriviumCount } from './trivium-reader-text'
import { TriviumReaderExpandableText } from './TriviumReaderClamp'
import { TriviumReaderSection } from './TriviumReaderSection'

const EXAMPLE_LIMIT = 3

type BarPart = { key: string; count: number; barClass: string; label: string }

function barParts(current: Record<string, number>): BarPart[] {
  const count = (key: string): number => current[key] ?? 0
  return [
    {
      key: 'valid',
      count: count('valid'),
      barClass: 'bg-trivium-success',
      label: translate('trivium.memory.valid', '{{n}} valid', {
        n: formatTriviumCount(count('valid'))
      })
    },
    {
      key: 'suspect',
      count: count('suspect'),
      barClass: 'bg-trivium-progress',
      label: translate('trivium.memory.suspect', '{{n}} to recheck', {
        n: formatTriviumCount(count('suspect'))
      })
    },
    {
      key: 'invalid',
      count: count('invalid'),
      barClass: 'bg-trivium-blocked',
      label: translate('trivium.memory.invalid', '{{n}} no longer hold', {
        n: formatTriviumCount(count('invalid'))
      })
    },
    {
      key: 'superseded',
      count: count('superseded'),
      barClass: 'bg-trivium-line',
      label: translate('trivium.memory.superseded', '{{n}} replaced by newer', {
        n: formatTriviumCount(count('superseded'))
      })
    }
  ]
}

function campaignsLabel(count: number): string {
  return count === 1
    ? translate('trivium.memory.acrossOne', 'Across 1 Campaign:')
    : translate('trivium.memory.acrossMany', 'Across {{n}} Campaigns:', {
        n: formatTriviumCount(count)
      })
}

/** What the Campaigns did to memory, then what memory holds now; examples stay folded. */
export function TriviumMemorySummary({
  memory,
  campaignCount
}: {
  memory: TriviumMemoryDelta
  campaignCount: number
}): React.JSX.Element {
  const delta = (key: string): string => formatTriviumCount(memory.campaigns[key] ?? 0)
  const parts = barParts(memory.current)
  const total = parts.reduce((sum, part) => sum + part.count, 0)
  const examples = memory.representative.added.slice(0, EXAMPLE_LIMIT)
  return (
    <TriviumReaderSection name="memory" title={translate('trivium.memory.title', 'Memory')}>
      <p className="text-[13px] leading-5 break-keep wrap-anywhere">
        {campaignsLabel(campaignCount)}{' '}
        <span className="font-medium text-trivium-success tabular-nums">+{delta('added')}</span>{' '}
        {translate('trivium.memory.added', 'added')}
        {' · '}
        <span className="font-medium tabular-nums">{delta('revalidated')}</span>{' '}
        {translate('trivium.memory.revalidated', 're-checked and kept')}
        {' · '}
        <span className="font-medium text-trivium-progress tabular-nums">
          {delta('suspect')}
        </span>{' '}
        {translate('trivium.memory.flagged', 'flagged for a recheck')}
        {' · '}
        <span className="font-medium text-trivium-blocked tabular-nums">
          {delta('invalid')}
        </span>{' '}
        {translate('trivium.memory.noLongerHold', 'no longer hold')}
      </p>
      {total > 0 ? (
        <>
          <div
            role="img"
            aria-label={translate('trivium.memory.barLabel', 'Current memory: {{parts}}', {
              parts: parts.map((part) => part.label).join(', ')
            })}
            className="mt-2.5 flex h-1.5 max-w-[520px] overflow-hidden rounded-full bg-muted"
          >
            {parts.map((part) =>
              part.count > 0 ? (
                <span
                  key={part.key}
                  className={part.barClass}
                  style={{ width: `${(part.count / total) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
            {parts.map((part) => (
              <li key={part.key} className="inline-flex items-center gap-1.5 tabular-nums">
                <span aria-hidden="true" className={cn('size-2 rounded-[2px]', part.barClass)} />
                {part.label}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {examples.length > 0 ? (
        <Collapsible className="mt-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRight
                aria-hidden="true"
                className="size-3 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
              />
              {translate('trivium.memory.examples', 'Examples of added memory')}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5">
              {examples.map((statement) => (
                <li key={statement.id} className="border-b border-border py-2 last:border-b-0">
                  <TriviumReaderExpandableText
                    text={statement.object}
                    lines={3}
                    className="text-[13px] leading-5"
                  />
                  <p className="mt-0.5 text-xs text-muted-foreground break-keep wrap-anywhere">
                    {statement.relation.replace(/-/g, ' ')} · {statement.subject}
                  </p>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </TriviumReaderSection>
  )
}
