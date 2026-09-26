import type { ReactNode } from 'react'
import { CircleAlert, CirclePause, HeartPulse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumChange } from './trivium-change-markers'
import type { TriviumModel } from './trivium-goal-model'
import { describeTriviumChange } from './trivium-change-markers'
import { humanizeTriviumReason, triviumIdSlug } from './trivium-harness-text'
import type { TriviumNeedsYouItem } from './trivium-needs-you'
import {
  triviumContradictionCount,
  triviumOpenQuestionCount,
  triviumPromotionCount
} from './trivium-reader-text'
import { TriviumChangeDot } from './TriviumChangeDot'
import { TriviumMilestoneDiamond, TriviumTicketStatusIcon } from './TriviumIcons'
import { TriviumReaderSection } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

type RowDetail = { key: string; content: ReactNode }

type RowParts = {
  key: string
  icon: ReactNode
  title: ReactNode
  details: RowDetail[]
  side?: ReactNode
}

function actionButton(label: string, onClick: () => void): React.JSX.Element {
  return (
    <Button variant="outline" size="xs" onClick={onClick}>
      {label}
    </Button>
  )
}

function openGoalAction(
  model: TriviumModel,
  navigation: TriviumNavigation,
  goalId: string | null
): ReactNode {
  return goalId && model.isShown(goalId)
    ? actionButton(translate('trivium.needsYou.openGoal', 'Open goal'), () =>
        navigation.openItem(goalId)
      )
    : null
}

function milestoneCounts(item: Extract<TriviumNeedsYouItem, { kind: 'milestone' }>): ReactNode {
  return (
    <>
      <span className={cn(item.contradictions > 0 && 'text-trivium-blocked')}>
        {triviumContradictionCount(item.contradictions)}
      </span>
      {' · '}
      {triviumOpenQuestionCount(item.unknowns)}
      {' · '}
      {triviumPromotionCount(item.promotionCandidates)}
    </>
  )
}

function rowParts(
  item: TriviumNeedsYouItem,
  model: TriviumModel,
  navigation: TriviumNavigation,
  changes: ReadonlyMap<string, TriviumChange>
): RowParts {
  switch (item.kind) {
    case 'paused':
      return {
        key: `paused:${item.campaignId}`,
        icon: <CirclePause aria-hidden="true" className="size-4 text-trivium-decision" />,
        title: translate('trivium.needsYou.paused', '{{campaign}} is paused', {
          campaign: triviumIdSlug(item.campaignId)
        }),
        details: [
          {
            key: 'reason',
            content: item.reason ? (
              <TriviumRichText inline text={humanizeTriviumReason(item.reason)} />
            ) : item.code ? (
              translate('trivium.needsYou.pauseCode', 'Reason: {{code}}', { code: item.code })
            ) : (
              translate('trivium.needsYou.noPauseReason', 'No reason recorded')
            )
          }
        ],
        side: openGoalAction(model, navigation, item.goalId)
      }
    case 'escalation':
      return {
        key: `escalation:${item.featureId}`,
        icon: <CircleAlert aria-hidden="true" className="size-4 text-trivium-decision" />,
        title: translate('trivium.needsYou.escalation', '{{feature}} needs your decision', {
          feature: triviumIdSlug(item.featureId)
        }),
        details:
          item.reasons.length > 0 ? [{ key: 'reasons', content: item.reasons.join(' · ') }] : [],
        side: openGoalAction(
          model,
          navigation,
          item.campaignId ? model.campaignGoal(item.campaignId) : null
        )
      }
    case 'health':
      return {
        key: `health:${item.health}:${item.executionPolicy}`,
        icon: <HeartPulse aria-hidden="true" className="size-4 text-trivium-blocked" />,
        title: translate('trivium.needsYou.health', 'Theory health is {{health}}', {
          health: item.health || translate('trivium.needsYou.healthUnknown', 'unknown')
        }),
        details: [
          ...(item.reasons.length > 0
            ? [{ key: 'reasons', content: item.reasons.join(' · ') }]
            : []),
          ...(item.executionPolicy
            ? [
                {
                  key: 'policy',
                  content: translate(
                    'trivium.needsYou.executionPolicy',
                    'Execution policy: {{policy}}',
                    { policy: item.executionPolicy }
                  )
                }
              ]
            : [])
        ]
      }
    case 'milestone':
      return {
        key: `milestone:${item.campaignId}`,
        icon: <TriviumMilestoneDiamond review />,
        title: translate('trivium.needsYou.milestone', 'Review the {{campaign}} milestone', {
          campaign: triviumIdSlug(item.campaignId)
        }),
        details: [
          {
            key: 'summary',
            content: <TriviumRichText inline text={item.summary} className="line-clamp-2" />
          },
          { key: 'counts', content: milestoneCounts(item) }
        ],
        side:
          item.goalId && model.isShown(item.goalId)
            ? actionButton(translate('trivium.needsYou.read', 'Read'), () => {
                if (item.goalId) {
                  navigation.openItem(item.goalId, 'updates')
                }
              })
            : null
      }
    case 'candidate': {
      const change = changes.get(item.ticketId)
      return {
        key: `candidate:${item.ticketId}`,
        icon: <TriviumTicketStatusIcon kind="approval" />,
        title: <TriviumRichText inline text={item.title} />,
        details: [
          {
            key: 'parent',
            content: item.parentId
              ? translate('trivium.needsYou.proposedUnder', 'Proposed ticket · {{parent}}', {
                  parent: model.title(item.parentId)
                })
              : translate('trivium.needsYou.proposed', 'Proposed ticket')
          }
        ],
        side: (
          <>
            {change ? (
              <TriviumChangeDot
                kind={change.kind}
                description={
                  change.kind === 'changed' ? describeTriviumChange(change, model.title) : undefined
                }
              />
            ) : null}
            {model.isShown(item.ticketId)
              ? actionButton(translate('trivium.needsYou.review', 'Review'), () =>
                  navigation.openItem(item.ticketId)
                )
              : null}
          </>
        )
      }
    }
  }
}

/** What waits on the user, first on the Overview: each row names the decision and opens it. */
export function TriviumOverviewNeedsYou({
  model,
  items,
  changes,
  navigation
}: {
  model: TriviumModel
  items: readonly TriviumNeedsYouItem[]
  changes: ReadonlyMap<string, TriviumChange>
  navigation: TriviumNavigation
}): React.JSX.Element {
  return (
    <TriviumReaderSection
      name="needs-you"
      title={translate('trivium.overview.needsYou', 'Needs you')}
      count={items.length}
    >
      <ul className="-mx-2">
        {items.map((item) => {
          const row = rowParts(item, model, navigation, changes)
          return (
            <li
              key={row.key}
              data-trivium-needs-you={item.kind}
              className="flex items-start gap-2.5 border-t border-border px-2 py-2.5 first:border-t-0"
            >
              <span className="grid h-5 w-4 shrink-0 place-items-center">{row.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-5 font-medium break-keep wrap-anywhere">
                  {row.title}
                </p>
                {row.details.map((detail) => (
                  <p
                    key={detail.key}
                    className="mt-px text-xs leading-[18px] text-muted-foreground break-keep wrap-anywhere"
                  >
                    {detail.content}
                  </p>
                ))}
              </div>
              {row.side ? (
                <div className="flex shrink-0 items-center gap-2 self-center">{row.side}</div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </TriviumReaderSection>
  )
}
