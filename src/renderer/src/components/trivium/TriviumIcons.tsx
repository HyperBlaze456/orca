import type { ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

// Same six strings as the model's TriviumTicketKind; declared here so the icons stay model-free.
export type TriviumTicketStatusIconKind =
  | 'approval'
  | 'in-progress'
  | 'blocked'
  | 'open'
  | 'done'
  | 'abandoned'

export type TriviumOutcomeIconKind = 'unassessed' | 'achieved' | 'not-achieved'

export type TriviumIconProps = {
  /** Rendered width and height in px. */
  size?: number
  /** Accessible name. Without one the icon is decorative (aria-hidden). */
  label?: string
  className?: string
}

type TriviumIconFrameProps = TriviumIconProps & {
  icon: 'ticket-status' | 'progress-ring' | 'milestone' | 'ticket-group' | 'outcome'
  value?: string
  children: ReactNode
}

const RING_RADIUS = 5.6
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const CHECK_PATH = 'm5.2 8.2 1.9 1.9 3.8-4'
const DIAMOND_PATH = 'M8 1.8 14.2 8 8 14.2 1.8 8z'
// Why: a 15-unit box and the circles' 1.6/16 stroke give the bell the circles' optical size and weight.
const BELL_BOX = 15
const BELL_STROKE = (1.6 * 24) / BELL_BOX

function TriviumIconFrame({
  size = 14,
  label,
  className,
  icon,
  value,
  children
}: TriviumIconFrameProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-trivium-icon={icon}
      data-value={value}
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  )
}

function ticketStatusShape(kind: TriviumTicketStatusIconKind): React.JSX.Element {
  switch (kind) {
    case 'approval':
      return (
        <Bell
          x={(16 - BELL_BOX) / 2}
          y={(16 - BELL_BOX) / 2}
          size={BELL_BOX}
          strokeWidth={BELL_STROKE}
          className="text-trivium-decision"
        />
      )
    case 'in-progress':
      return (
        <>
          <circle cx="8" cy="8" r="6" strokeWidth="1.6" className="stroke-trivium-progress" />
          <path d="M8 4.2a3.8 3.8 0 0 1 0 7.6z" className="fill-trivium-progress" />
        </>
      )
    case 'blocked':
      return (
        <>
          <circle cx="8" cy="8" r="6" strokeWidth="1.6" className="stroke-trivium-blocked" />
          <path
            d="M8 5v3.4"
            strokeWidth="1.7"
            strokeLinecap="round"
            className="stroke-trivium-blocked"
          />
          <circle cx="8" cy="11" r="1" className="fill-trivium-blocked" />
        </>
      )
    case 'open':
      return <circle cx="8" cy="8" r="6" strokeWidth="1.6" className="stroke-muted-foreground" />
    case 'done':
      return (
        <>
          <circle cx="8" cy="8" r="6.8" className="fill-trivium-done" />
          <path
            d={CHECK_PATH}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-trivium-on-color"
          />
        </>
      )
    case 'abandoned':
      return (
        <>
          <circle cx="8" cy="8" r="6.8" className="fill-muted-foreground/60" />
          <path
            d="m5.7 5.7 4.6 4.6m0-4.6-4.6 4.6"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="stroke-trivium-on-color"
          />
        </>
      )
  }
}

export function TriviumTicketStatusIcon({
  kind,
  ...props
}: TriviumIconProps & { kind: TriviumTicketStatusIconKind }): React.JSX.Element {
  return (
    <TriviumIconFrame {...props} icon="ticket-status" value={kind}>
      {ticketStatusShape(kind)}
    </TriviumIconFrame>
  )
}

/** Done share of a Goal's work: arc from 12 o'clock clockwise over a neutral track. */
export function TriviumProgressRing({
  fraction,
  dashed = false,
  ...props
}: TriviumIconProps & { fraction: number; dashed?: boolean }): React.JSX.Element {
  const done = Number.isNaN(fraction) ? 0 : Math.min(1, Math.max(0, fraction))
  return (
    <TriviumIconFrame {...props} icon="progress-ring" value={String(done)}>
      <circle
        cx="8"
        cy="8"
        r={RING_RADIUS}
        strokeWidth="2.2"
        strokeDasharray={dashed ? '2.4 2' : undefined}
        className="stroke-trivium-line"
      />
      {done > 0 ? (
        <circle
          cx="8"
          cy="8"
          r={RING_RADIUS}
          strokeWidth="2.2"
          strokeDasharray={`${(RING_LENGTH * done).toFixed(2)} ${RING_LENGTH.toFixed(2)}`}
          transform="rotate(-90 8 8)"
          className="stroke-trivium-done"
        />
      ) : null}
    </TriviumIconFrame>
  )
}

export function TriviumMilestoneDiamond({
  review = false,
  ...props
}: TriviumIconProps & { review?: boolean }): React.JSX.Element {
  return (
    <TriviumIconFrame {...props} icon="milestone" value={review ? 'review' : undefined}>
      <path
        d={DIAMOND_PATH}
        strokeWidth="1.5"
        strokeLinejoin="round"
        className={
          review ? 'fill-trivium-decision stroke-trivium-decision' : 'stroke-muted-foreground'
        }
      />
    </TriviumIconFrame>
  )
}

export function TriviumTicketGroupIcon(props: TriviumIconProps): React.JSX.Element {
  return (
    <TriviumIconFrame {...props} icon="ticket-group">
      <rect
        x="2"
        y="3"
        width="12"
        height="3"
        rx="1"
        strokeWidth="1.4"
        className="stroke-muted-foreground"
      />
      <rect
        x="2"
        y="10"
        width="12"
        height="3"
        rx="1"
        strokeWidth="1.4"
        className="stroke-muted-foreground"
      />
    </TriviumIconFrame>
  )
}

function outcomeShape(outcome: TriviumOutcomeIconKind): React.JSX.Element {
  switch (outcome) {
    case 'unassessed':
      return (
        <circle
          cx="8"
          cy="8"
          r="6"
          strokeWidth="1.6"
          strokeDasharray="2.2 2.2"
          className="stroke-muted-foreground"
        />
      )
    case 'achieved':
      return (
        <>
          <circle cx="8" cy="8" r="6.8" className="fill-trivium-success" />
          <path
            d={CHECK_PATH}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-trivium-on-color"
          />
        </>
      )
    case 'not-achieved':
      return (
        <>
          <circle cx="8" cy="8" r="6" strokeWidth="1.6" className="stroke-trivium-blocked" />
          <path
            d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="stroke-trivium-blocked"
          />
        </>
      )
  }
}

export function TriviumOutcomeIcon({
  outcome,
  ...props
}: TriviumIconProps & { outcome: TriviumOutcomeIconKind }): React.JSX.Element {
  return (
    <TriviumIconFrame {...props} icon="outcome" value={outcome}>
      {outcomeShape(outcome)}
    </TriviumIconFrame>
  )
}
