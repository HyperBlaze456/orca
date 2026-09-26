import { translate } from '@/i18n/i18n'
import type { TriviumModel } from './trivium-goal-model'
import { TriviumOutcomeIcon, type TriviumOutcomeIconKind } from './TriviumIcons'
import { TriviumReaderSubheading } from './TriviumReaderSection'
import { TriviumRichText } from './TriviumRichText'

// trivium GoalVerdict: unknown | met | not-met.
function verdictIcon(verdict: string): TriviumOutcomeIconKind {
  if (verdict === 'met') {
    return 'achieved'
  }
  return verdict === 'not-met' ? 'not-achieved' : 'unassessed'
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'met':
      return translate('trivium.criteria.met', 'Met')
    case 'not-met':
      return translate('trivium.criteria.notMet', 'Not met')
    case 'unknown':
      return translate('trivium.criteria.unknown', 'Unknown')
    default:
      return verdict
  }
}

/**
 * Where a Goal's success criteria go. The status protocol carries criteria only inside an
 * assessment, so an unassessed Goal says that none are recorded rather than showing nothing.
 */
export function TriviumGoalCriteria({
  model,
  id
}: {
  model: TriviumModel
  id: string
}): React.JSX.Element {
  const assessment = model.progressGoal(id)?.assessment ?? null
  const criteria = assessment?.criteria ?? []
  const title = translate('trivium.criteria.title', 'Success criteria')
  if (!assessment || criteria.length === 0) {
    return (
      <p
        data-trivium-criteria="none"
        className="mt-3 text-xs text-muted-foreground break-keep wrap-anywhere"
      >
        <span className="font-medium text-foreground">{title}</span>
        {' · '}
        {translate('trivium.criteria.none', 'No success criteria recorded yet.')}
      </p>
    )
  }
  return (
    <div data-trivium-criteria="assessed" className="mt-3">
      <TriviumReaderSubheading title={title} count={criteria.length} />
      <ul className="text-[13px] leading-5">
        {criteria.map((criterion) => (
          <li key={criterion.text} className="flex items-start gap-2 py-1">
            <span className="grid h-5 w-4 shrink-0 place-items-center">
              <TriviumOutcomeIcon size={12} outcome={verdictIcon(criterion.verdict)} />
            </span>
            <TriviumRichText inline text={criterion.text} className="min-w-0 flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground">
              {verdictLabel(criterion.verdict)}
            </span>
          </li>
        ))}
      </ul>
      {assessment.explanation ? (
        <TriviumRichText
          text={assessment.explanation}
          className="mt-1 max-w-[70ch] text-xs leading-5 text-muted-foreground"
        />
      ) : null}
    </div>
  )
}
