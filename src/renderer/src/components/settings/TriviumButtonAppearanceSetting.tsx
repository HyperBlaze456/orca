import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import type { SettingsSearchEntry } from './settings-search'

type TriviumButtonAppearanceSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  searchEntry: SettingsSearchEntry | undefined
}

export function TriviumButtonAppearanceSetting({
  settings,
  updateSettings,
  searchEntry
}: TriviumButtonAppearanceSettingProps): React.JSX.Element {
  const title = translate(
    'auto.components.settings.AppearancePane.showTriviumButton',
    'Show Trivium Button'
  )
  return (
    <SearchableSetting
      title={title}
      description={searchEntry?.description}
      keywords={searchEntry?.keywords ?? ['trivium', 'harness', 'sidebar']}
    >
      <SettingsSwitchRow
        label={title}
        description={translate(
          'auto.components.settings.AppearancePane.showTriviumButtonDescription',
          'Show the Trivium harness shortcut in the sidebar.'
        )}
        checked={settings.showTriviumButton !== false}
        onChange={() =>
          updateSettings({ showTriviumButton: !(settings.showTriviumButton !== false) })
        }
      />
    </SearchableSetting>
  )
}
