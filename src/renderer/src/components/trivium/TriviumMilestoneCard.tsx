import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumModel } from './trivium-goal-model'
import { triviumCampaignPhaseLabel, triviumIdSlug } from './trivium-harness-text'
import type { TriviumProgressMilestone } from './trivium-progress-records'
import {
  triviumContradictionCount,
  triviumDriftCount,
  triviumPromotionCount,
  triviumTheoryIdParts,
  triviumTradeOffCount
} from './trivium-reader-text'
import { TriviumMilestoneDiamond } from './TriviumIcons'
import { TriviumReaderQuietButton } from './TriviumReaderButtons'
import { TriviumReaderPill } from './TriviumReaderPill'
import { TriviumReaderSubheading } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'

function TheoryId({ id }: { id: string }): React.JSX.Element {
  const { kind, name } = triviumTheoryIdParts(id)
  return (
    <span className="break-keep wrap-anywhere">
      {kind ? (
        <span className="mr-1.5 text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {kind}
        </span>
      ) : null}
      {name}
    </span>
  )
}

function MilestoneList({
  title,
  items,
  theory = false
}: {
  title: string
  items: readonly string[]
  theory?: boolean
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }
  return (
    <>
      <TriviumReaderSubheading title={title} count={items.length} />
      <ul className="list-disc pl-4.5 text-[13px] leading-5">
        {items.map((item) => (
          <li key={item} className="mb-1.5">
            {theory ? <TheoryId id={item} /> : <TriviumRichText inline text={item} />}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * A milestone update: its Campaign, a 3-line summary and what it left open. "Read full
 * milestone" unfolds the summary with its drift, trade-offs and promotion candidates.
 */
export function TriviumMilestoneCard({
  model,
  milestone,
  contradictions
}: {
  model: TriviumModel
  milestone: TriviumProgressMilestone
  /** Contradictions the milestone's Campaign named. */
  contradictions: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const review = milestone.campaignId === model.reviewCampaignId
  const phase = model.progress?.campaigns.find((item) => item.id === milestone.campaignId)?.phase
  return (
    <article
      data-trivium-milestone={milestone.campaignId}
      className="rounded-xl border border-border bg-card px-4 py-3.5 text-card-foreground"
    >
      <header className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
        <TriviumMilestoneDiamond review={review} />
        <span className="min-w-0 font-semibold wrap-anywhere">
          {triviumIdSlug(milestone.campaignId)}
        </span>
        {phase ? (
          <span className="min-w-0 text-muted-foreground wrap-anywhere">
            · {triviumCampaignPhaseLabel(phase)}
          </span>
        ) : null}
        {review ? (
          <TriviumReaderPill size="sm" tone="decision">
            {translate('trivium.milestone.readyForReview', 'Ready for your review')}
          </TriviumReaderPill>
        ) : null}
      </header>
      <TriviumRichText
        text={milestone.summary}
        className={cn('mt-2 text-[13px] leading-[1.65]', !open && 'line-clamp-3')}
      />
      {open ? (
        <div data-trivium-milestone-detail="">
          <MilestoneList
            title={translate('trivium.milestone.drift', 'Drift')}
            items={milestone.drift}
          />
          <MilestoneList
            title={translate('trivium.milestone.tradeOffs', 'Trade-offs')}
            items={milestone.tradeOffs}
          />
          <MilestoneList
            title={translate('trivium.milestone.promotions', 'Promotion candidates')}
            items={milestone.promotionCandidates}
            theory
          />
        </div>
      ) : null}
      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {contradictions > 0 ? (
          <TriviumReaderPill size="sm" tone="blocked">
            <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
            {triviumContradictionCount(contradictions)}
          </TriviumReaderPill>
        ) : null}
        {milestone.drift.length > 0 ? (
          <TriviumReaderPill size="sm">
            {triviumDriftCount(milestone.drift.length)}
          </TriviumReaderPill>
        ) : null}
        {milestone.tradeOffs.length > 0 ? (
          <TriviumReaderPill size="sm">
            {triviumTradeOffCount(milestone.tradeOffs.length)}
          </TriviumReaderPill>
        ) : null}
        {milestone.promotionCandidates.length > 0 ? (
          <TriviumReaderPill size="sm">
            {triviumPromotionCount(milestone.promotionCandidates.length)}
          </TriviumReaderPill>
        ) : null}
        <TriviumReaderQuietButton
          className="ml-auto"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open
            ? translate('trivium.reader.showLess', 'Show less')
            : translate('trivium.milestone.readFull', 'Read full milestone')}
        </TriviumReaderQuietButton>
      </footer>
    </article>
  )
}
