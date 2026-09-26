import { ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import { triviumIdSlug } from './trivium-harness-text'
import type { TriviumContradiction, TriviumGoalMilestones } from './trivium-milestones'
import { TriviumMilestoneDiamond } from './TriviumIcons'
import { TriviumMilestoneCard } from './TriviumMilestoneCard'
import { TriviumReaderSection } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

/** The anchor `updates` routes land on: the latest own milestone, else the sub-goal list. */
export const TRIVIUM_UPDATES_ANCHOR = 'updates'

/**
 * Milestones of Campaigns anchored on this Goal as update cards (latest first), then the
 * milestones rolled up from sub-goals as rows that open the sub-goal's own updates.
 */
export function TriviumGoalPageMilestones({
  model,
  milestones,
  contradictions,
  navigation
}: {
  model: TriviumModel
  milestones: TriviumGoalMilestones
  contradictions: readonly TriviumContradiction[]
  navigation: TriviumNavigation
}): React.JSX.Element {
  const { own, inSubGoals, latest } = milestones
  const newestFirst = own.toReversed()
  const contradictionsOf = (campaignId: string): number =>
    contradictions.filter((item) => item.campaignId === campaignId).length
  return (
    <>
      {latest ? (
        <TriviumReaderSection
          name="latest-milestone"
          title={translate('trivium.goalPage.latestMilestone', 'Latest milestone')}
          anchor={TRIVIUM_UPDATES_ANCHOR}
        >
          <div className="flex flex-col gap-2.5">
            {newestFirst.map((milestone) => (
              <TriviumMilestoneCard
                key={`${milestone.campaignId}\n${milestone.proposalId || milestone.summary}`}
                model={model}
                milestone={milestone}
                contradictions={contradictionsOf(milestone.campaignId)}
              />
            ))}
          </div>
        </TriviumReaderSection>
      ) : null}
      {inSubGoals.length > 0 ? (
        <TriviumReaderSection
          name="sub-goal-milestones"
          title={translate('trivium.goalPage.subGoalMilestones', 'Milestones in sub-goals')}
          count={inSubGoals.length}
          anchor={latest ? undefined : TRIVIUM_UPDATES_ANCHOR}
        >
          <ul className="-mx-2">
            {inSubGoals.map((milestone) => {
              const goalId =
                milestone.goalId && model.isShown(milestone.goalId) ? milestone.goalId : null
              const body = (
                <>
                  <TriviumMilestoneDiamond
                    review={milestone.campaignId === model.reviewCampaignId}
                  />
                  <span className="min-w-0 truncate font-medium">
                    {triviumIdSlug(milestone.campaignId)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mx-1 min-w-5 flex-1 translate-y-[3px] border-b border-dotted border-trivium-line"
                  />
                  {milestone.goalId ? (
                    <span className="max-w-[50%] min-w-0 truncate text-xs text-muted-foreground">
                      <TriviumRichText inline text={model.title(milestone.goalId)} />
                    </span>
                  ) : null}
                </>
              )
              return (
                <li
                  key={`${milestone.campaignId}\n${milestone.proposalId || milestone.summary}`}
                  data-trivium-sub-goal-milestone={milestone.campaignId}
                >
                  {goalId ? (
                    <button
                      type="button"
                      onClick={() => navigation.openItem(goalId, 'updates')}
                      className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-[7px] text-left text-[13px] hover:bg-trivium-row-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {body}
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2.5 px-2 py-[7px] text-[13px]">
                      {body}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </TriviumReaderSection>
      ) : null}
    </>
  )
}
