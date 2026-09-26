import { useState, type ReactNode } from 'react'
import { CircleHelp, TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { triviumIdSlug } from './trivium-harness-text'
import type { TriviumOpenQuestions, TriviumUnknown } from './trivium-milestones'
import { triviumShowAllCount } from './trivium-reader-text'
import { TriviumReaderQuietButton } from './TriviumReaderButtons'
import { TriviumReaderExpandableText } from './TriviumReaderClamp'
import { TriviumReaderSection, TriviumReaderSubheading } from './TriviumReaderSection'

type QuestionItem = { key: string; text: string; campaignId: string }

const FIRST_SHOWN = 3

function milestoneSource(campaignId: string): string {
  return translate('trivium.questions.source', '{{campaign}} milestone', {
    campaign: triviumIdSlug(campaignId)
  })
}

/** Open questions, each clamped to two lines (click to read all); the first three, then all. */
export function TriviumOpenQuestionList({
  name,
  items,
  icon
}: {
  name: string
  items: readonly QuestionItem[]
  icon?: ReactNode
}): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, FIRST_SHOWN)
  return (
    <div data-trivium-questions={name}>
      <ul>
        {shown.map((item) => (
          <li key={item.key} className="flex gap-2.5 border-b border-border py-2 last:border-b-0">
            {icon ? <span className="w-4 shrink-0 pt-0.5">{icon}</span> : null}
            <div className="min-w-0 flex-1">
              <TriviumReaderExpandableText
                text={item.text}
                lines={2}
                className="text-[13px] leading-5"
              />
              <p className="mt-0.5 text-xs text-muted-foreground wrap-anywhere">
                {milestoneSource(item.campaignId)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {items.length > FIRST_SHOWN ? (
        <TriviumReaderQuietButton
          className="mt-2 -ml-2"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? translate('trivium.reader.showLess', 'Show less')
            : triviumShowAllCount(items.length)}
        </TriviumReaderQuietButton>
      ) : null}
    </div>
  )
}

function unknownItems(unknowns: readonly TriviumUnknown[]): QuestionItem[] {
  return unknowns.map((unknown) => ({
    key: `${unknown.campaignId}\n${unknown.text}`,
    text: unknown.text,
    campaignId: unknown.campaignId
  }))
}

/** Overview: the contradictions milestones named, then their unknowns. */
export function TriviumOverviewOpenQuestions({
  questions
}: {
  questions: TriviumOpenQuestions
}): React.JSX.Element {
  const { contradictions, unknowns } = questions
  return (
    <TriviumReaderSection
      name="open-questions"
      title={translate('trivium.questions.title', 'Open questions')}
      count={contradictions.length + unknowns.length}
    >
      {contradictions.length > 0 ? (
        <>
          <TriviumReaderSubheading
            icon={<TriangleAlert aria-hidden="true" className="size-3.5 text-trivium-blocked" />}
            title={translate('trivium.questions.contradictions', 'Contradictions')}
            count={contradictions.length}
          />
          <TriviumOpenQuestionList
            name="contradictions"
            items={contradictions.map((item) => ({
              key: `${item.campaignId}\n${item.proposalId}\n${item.text}`,
              text: item.text,
              campaignId: item.campaignId
            }))}
          />
        </>
      ) : null}
      {unknowns.length > 0 ? (
        <>
          <TriviumReaderSubheading
            icon={<CircleHelp aria-hidden="true" className="size-3.5 text-muted-foreground" />}
            title={translate('trivium.questions.unknowns', 'Unknowns')}
            count={unknowns.length}
          />
          <TriviumOpenQuestionList name="unknowns" items={unknownItems(unknowns)} />
        </>
      ) : null}
    </TriviumReaderSection>
  )
}

/** Goal page: the unknowns its own milestones left open. */
export function TriviumGoalOpenQuestions({
  unknowns
}: {
  unknowns: readonly TriviumUnknown[]
}): React.JSX.Element {
  return (
    <TriviumReaderSection
      name="open-questions"
      title={translate('trivium.questions.title', 'Open questions')}
      count={unknowns.length}
    >
      <TriviumOpenQuestionList
        name="unknowns"
        items={unknownItems(unknowns)}
        icon={<CircleHelp aria-hidden="true" className="size-3.5 text-muted-foreground" />}
      />
    </TriviumReaderSection>
  )
}
