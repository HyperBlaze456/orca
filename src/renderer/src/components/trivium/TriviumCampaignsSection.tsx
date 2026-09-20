import type { TriviumCampaign } from '../../../../shared/trivium-workspace-status'
import { Badge } from '../ui/badge'
import { translate } from '@/i18n/i18n'
import { TriviumFact, TriviumRow, TriviumSection } from './TriviumSection'

const NOT_SET = '—'

/** Open Campaigns and the three facts a session needs before stepping one. */
export function TriviumCampaignsSection({
  campaigns
}: {
  campaigns: { open: TriviumCampaign[]; closed: number }
}): React.JSX.Element {
  return (
    <TriviumSection
      title={translate('auto.components.trivium.TriviumCampaignsSection.title', 'Campaigns')}
      meta={translate(
        'auto.components.trivium.TriviumCampaignsSection.closed',
        '{{count}} closed',
        { count: campaigns.closed }
      )}
      isEmpty={campaigns.open.length === 0}
      emptyLabel={translate(
        'auto.components.trivium.TriviumCampaignsSection.empty',
        'No open Campaign.'
      )}
    >
      <div>
        {campaigns.open.map((campaign) => (
          <TriviumRow key={campaign.campaign_id} className="gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">
                {campaign.campaign_id}
              </span>
              <Badge variant={campaign.phase === 'paused' ? 'outline' : 'secondary'}>
                {campaign.phase}
              </Badge>
              {campaign.pause_code ? (
                <Badge variant="destructive">{campaign.pause_code}</Badge>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <TriviumFact
                label={translate('auto.components.trivium.TriviumCampaignsSection.goal', 'Goal')}
              >
                <span className="font-mono">{campaign.goal_id}</span>
              </TriviumFact>
              <TriviumFact
                label={translate(
                  'auto.components.trivium.TriviumCampaignsSection.currentFeature',
                  'Current Feature'
                )}
              >
                <span className="font-mono">{campaign.current_feature ?? NOT_SET}</span>
              </TriviumFact>
              <TriviumFact
                label={translate(
                  'auto.components.trivium.TriviumCampaignsSection.holder',
                  'Holder'
                )}
              >
                <span className="font-mono">{campaign.holder ?? NOT_SET}</span>
              </TriviumFact>
              <TriviumFact
                label={translate(
                  'auto.components.trivium.TriviumCampaignsSection.generation',
                  'Generation'
                )}
              >
                {campaign.generation}
              </TriviumFact>
            </div>
          </TriviumRow>
        ))}
      </div>
    </TriviumSection>
  )
}
