import { triviumLaneArrowPaths, type TriviumLaneEdge } from './trivium-dependency-lane'

/** Row tops and the lane column's left edge, in the tree content's coordinates. */
export type TriviumLanePositions = { tops: readonly number[]; laneLeft: number }

/**
 * Depends-on arrows over the tree rows. It paints only; the rows keep the pointer, and the arrows
 * are summarized for assistive tech by the pane's foot line.
 */
export function TriviumDependencyLane({
  edges,
  positions
}: {
  edges: readonly TriviumLaneEdge[]
  positions: TriviumLanePositions | null
}): React.JSX.Element | null {
  const arrowPaths = positions
    ? triviumLaneArrowPaths(edges, positions.tops, positions.laneLeft)
    : []
  if (arrowPaths.length === 0) {
    return null
  }
  return (
    <svg
      aria-hidden="true"
      data-trivium-dependency-lane=""
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {arrowPaths.map((arrowPath) => (
        <g
          key={arrowPath.key}
          data-strong={arrowPath.strong ? 'true' : undefined}
          className={
            arrowPath.strong
              ? 'fill-trivium-line-strong stroke-trivium-line-strong'
              : 'fill-trivium-line stroke-trivium-line'
          }
        >
          <path d={arrowPath.line} fill="none" strokeWidth={1.25} />
          <path d={arrowPath.arrow} stroke="none" />
          <circle cx={arrowPath.dotX} cy={arrowPath.dotY} r={1.7} stroke="none" />
        </g>
      ))}
    </svg>
  )
}
