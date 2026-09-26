import { useId } from 'react'
import { Check, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import {
  TRIVIUM_TICKET_LIST_GROUPINGS,
  TRIVIUM_TICKET_LIST_ORDERINGS,
  TRIVIUM_TICKET_LIST_PROPERTIES,
  type TriviumTicketListGrouping,
  type TriviumTicketListOptions,
  type TriviumTicketListOrdering,
  type TriviumTicketListProperty
} from './trivium-ticket-list-options'

function groupingLabel(grouping: TriviumTicketListGrouping): string {
  switch (grouping) {
    case 'status':
      return translate('trivium.display.groupStatus', 'Status')
    case 'goal':
      return translate('trivium.display.groupGoal', 'Goal')
    case 'none':
      return translate('trivium.display.groupNone', 'None')
  }
}

function orderingLabel(ordering: TriviumTicketListOrdering): string {
  return ordering === 'goal'
    ? translate('trivium.display.orderGoal', 'Goal order')
    : translate('trivium.display.orderTitle', 'Title')
}

function propertyLabel(property: TriviumTicketListProperty): string {
  switch (property) {
    case 'id':
      return translate('trivium.display.propertyId', 'ID')
    case 'goal':
      return translate('trivium.display.propertyGoal', 'Goal')
    case 'commit':
      return translate('trivium.display.propertyCommit', 'Commit')
  }
}

/** Linear's Display popover: grouping, ordering, which row properties show, done tickets. */
export function TriviumTicketDisplayMenu({
  options,
  onChange
}: {
  options: TriviumTicketListOptions
  onChange: (options: TriviumTicketListOptions) => void
}): React.JSX.Element {
  const ids = { grouping: useId(), ordering: useId(), properties: useId(), done: useId() }
  const enabled = TRIVIUM_TICKET_LIST_PROPERTIES.filter((property) => options.properties[property])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          {translate('trivium.display.button', 'Display')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72"
        aria-label={translate('trivium.display.title', 'Display options')}
      >
        <div className="space-y-3 p-3">
          <div className="space-y-1.5">
            <p id={ids.grouping} className="text-xs text-muted-foreground">
              {translate('trivium.display.grouping', 'Grouping')}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby={ids.grouping}
              value={options.grouping}
              onValueChange={(value) => {
                const grouping = TRIVIUM_TICKET_LIST_GROUPINGS.find((item) => item === value)
                if (grouping) {
                  onChange({ ...options, grouping })
                }
              }}
              className="w-full"
            >
              {TRIVIUM_TICKET_LIST_GROUPINGS.map((grouping) => (
                <ToggleGroupItem key={grouping} value={grouping} className="flex-1">
                  {groupingLabel(grouping)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <p id={ids.ordering} className="text-xs text-muted-foreground">
              {translate('trivium.display.ordering', 'Ordering')}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby={ids.ordering}
              value={options.ordering}
              onValueChange={(value) => {
                const ordering = TRIVIUM_TICKET_LIST_ORDERINGS.find((item) => item === value)
                if (ordering) {
                  onChange({ ...options, ordering })
                }
              }}
              className="w-full"
            >
              {TRIVIUM_TICKET_LIST_ORDERINGS.map((ordering) => (
                <ToggleGroupItem key={ordering} value={ordering} className="flex-1">
                  {orderingLabel(ordering)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <p id={ids.properties} className="text-xs text-muted-foreground">
              {translate('trivium.display.properties', 'Properties')}
            </p>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              spacing={1}
              aria-labelledby={ids.properties}
              value={enabled}
              onValueChange={(values) =>
                onChange({
                  ...options,
                  properties: {
                    id: values.includes('id'),
                    goal: values.includes('goal'),
                    commit: values.includes('commit')
                  }
                })
              }
            >
              {TRIVIUM_TICKET_LIST_PROPERTIES.map((property) => (
                <ToggleGroupItem key={property} value={property}>
                  {options.properties[property] ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : null}
                  {propertyLabel(property)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <Label htmlFor={ids.done}>
              {translate('trivium.display.showDone', 'Show done tickets')}
            </Label>
            <Switch
              id={ids.done}
              checked={options.showDone}
              onCheckedChange={(showDone) => onChange({ ...options, showDone })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
