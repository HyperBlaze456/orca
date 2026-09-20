import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { TriviumGraphFilter, TriviumGraphTextSize } from './trivium-goal-graph'
import { isTriviumGraphFilter } from './trivium-graph-preferences'

export function TriviumGraphToolbar({
  filter,
  textSize,
  visibleCount,
  totalCount,
  onFilter,
  onTextSize
}: {
  filter: TriviumGraphFilter
  textSize: TriviumGraphTextSize
  visibleCount: number
  totalCount: number
  onFilter: (filter: TriviumGraphFilter) => void
  onTextSize: (size: TriviumGraphTextSize) => void
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="trivium-graph-filter">{translate('trivium.graph.show', 'Show')}</Label>
        <Select
          value={filter}
          onValueChange={(value) => {
            if (isTriviumGraphFilter(value)) {
              onFilter(value)
            }
          }}
        >
          <SelectTrigger id="trivium-graph-filter" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not-rejected">
              {translate('trivium.graph.notRejected', 'Except rejected')}
            </SelectItem>
            <SelectItem value="all">{translate('trivium.graph.all', 'All goals')}</SelectItem>
            <SelectItem value="adopted">{translate('trivium.graph.adopted', 'Adopted')}</SelectItem>
            <SelectItem value="anticipated">
              {translate('trivium.graph.anticipated', 'Anticipated')}
            </SelectItem>
            <SelectItem value="candidate">
              {translate('trivium.graph.candidate', 'Candidate')}
            </SelectItem>
            <SelectItem value="rejected">
              {translate('trivium.graph.rejected', 'Rejected')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="trivium-graph-text-size">
          {translate('trivium.graph.textSize', 'Text size')}
        </Label>
        <Select
          value={textSize}
          onValueChange={(value) => {
            if (value === 'standard' || value === 'large') {
              onTextSize(value)
            }
          }}
        >
          <SelectTrigger id="trivium-graph-text-size" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">
              {translate('trivium.graph.standard', 'Standard')}
            </SelectItem>
            <SelectItem value="large">{translate('trivium.graph.large', 'Large')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <span className="text-sm text-muted-foreground" role="status">
        {translate('trivium.graph.visibleCount', '{{visible}} / {{total}} goals', {
          visible: visibleCount,
          total: totalCount
        })}
      </span>
    </div>
  )
}
