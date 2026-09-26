import type { TriviumCampaignPhase } from '../../../../shared/trivium-workspace-status'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TriviumModel } from './trivium-goal-model'
import {
  triviumCampaignPhaseLabel,
  triviumCampaignPhaseNeedsUser,
  triviumIdSlug
} from './trivium-harness-text'
import { TriviumMilestoneDiamond } from './TriviumIcons'
import { TriviumReaderSection } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'
import type { TriviumNavigation } from './use-trivium-navigation'

function phaseTone(phase: TriviumCampaignPhase): string {
  if (triviumCampaignPhaseNeedsUser(phase)) {
    return 'text-trivium-decision'
  }
  return phase === 'started' || phase === 'active'
    ? 'text-trivium-progress'
    : 'text-muted-foreground'
}

/** Campaigns, most recent first: diamond, slug, the Goal it serves and its phase in words. */
export function TriviumOverviewCampaigns({
  model,
  navigation
}: {
  model: TriviumModel
  navigation: TriviumNavigation
}): React.JSX.Element | null {
  const campaigns = (model.progress?.campaigns ?? []).toReversed()
  if (campaigns.length === 0) {
    return null
  }
  return (
    <TriviumReaderSection
      name="campaigns"
      title={translate('trivium.campaigns.title', 'Campaigns')}
      count={campaigns.length}
    >
      <ul className="-mx-2">
        {campaigns.map((campaign) => {
          const goalId = campaign.goalId ?? model.campaignGoal(campaign.id)
          const body = (
            <>
              <span className="grid w-4 shrink-0 place-items-center">
                <TriviumMilestoneDiamond review={campaign.id === model.reviewCampaignId} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-5">
                  {triviumIdSlug(campaign.id)}
                </span>
                {goalId ? (
                  <span className="mt-px block truncate text-xs leading-[18px] text-muted-foreground">
                    <TriviumRichText inline text={model.title(goalId)} />
                  </span>
                ) : null}
              </span>
              <span className={cn('shrink-0 text-xs', phaseTone(campaign.phase))}>
                {triviumCampaignPhaseLabel(campaign.phase)}
              </span>
            </>
          )
          return (
            <li key={campaign.id} data-trivium-campaign={campaign.id}>
              {goalId && model.isShown(goalId) ? (
                <button
                  type="button"
                  onClick={() => navigation.openItem(goalId)}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-[7px] text-left hover:bg-trivium-row-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {body}
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5 px-2 py-[7px]">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </TriviumReaderSection>
  )
}
