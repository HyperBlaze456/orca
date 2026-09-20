import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { TriviumRecordDetails } from './TriviumRecordDetails'
import { useTriviumProjection, type TriviumProjectionQuery } from './use-trivium-projection'

export function TriviumProjectionPanel({
  workspaceId,
  query,
  onClearScope
}: {
  workspaceId: string
  query: TriviumProjectionQuery
  onClearScope: () => void
}): React.JSX.Element {
  const { data, error, loading, refresh } = useTriviumProjection(workspaceId, query)
  const [search, setSearch] = useState('')
  const scope = query.kind === 'tickets' ? query.under : query.campaign
  const tickets = data && Array.isArray(data.tickets) ? data.tickets : []
  const visible = tickets.filter((ticket) =>
    JSON.stringify(ticket).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  )
  const progress = data
    ? Object.fromEntries(
        Object.entries(data).filter(
          ([key]) =>
            !['supported', 'host', 'kind', 'schema_version', 'model_revision'].includes(key)
        )
      )
    : null
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={
        query.kind === 'tickets'
          ? translate('trivium.inspect.tickets', 'Ticket details')
          : translate('trivium.inspect.progress', 'Progress details')
      }
    >
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {translate(
              'trivium.inspect.readOnly',
              'Read-only details. Expand a record to explore its contents.'
            )}
          </p>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {translate('trivium.inspect.refresh', 'Refresh details')}
          </Button>
        </div>
        {scope ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm break-all">{scope}</span>
            <Button variant="ghost" size="sm" onClick={onClearScope}>
              {translate('trivium.inspect.clearScope', 'Show entire workspace')}
            </Button>
          </div>
        ) : null}
        {query.kind === 'tickets' ? (
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={translate('trivium.inspect.searchTickets', 'Search ticket details')}
            placeholder={translate(
              'trivium.inspect.searchPlaceholder',
              'Search titles, descriptions or IDs…'
            )}
          />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-sleek">
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {translate('trivium.inspect.loading', 'Loading details…')}
          </p>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm whitespace-pre-wrap break-words">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              {translate('common.retry', 'Retry')}
            </Button>
          </div>
        ) : data ? (
          <TriviumRecordDetails value={query.kind === 'tickets' ? visible : progress} />
        ) : null}
      </div>
    </section>
  )
}
