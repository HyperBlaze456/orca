// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import {
  TriviumMilestoneDiamond,
  TriviumOutcomeIcon,
  TriviumProgressRing,
  TriviumTicketGroupIcon,
  TriviumTicketStatusIcon,
  type TriviumOutcomeIconKind,
  type TriviumTicketStatusIconKind
} from './TriviumIcons'

afterEach(cleanup)

const RING_LENGTH = 2 * Math.PI * 5.6
const CHECK = 'm5.2 8.2 1.9 1.9 3.8-4'

function renderIcon(icon: ReactElement): SVGSVGElement {
  const svg = render(icon).container.querySelector('svg')
  if (!svg) {
    throw new Error('icon rendered no svg')
  }
  return svg
}

// Top-level shapes as "tag.class", which is what distinguishes one glyph from another.
function shapeOf(svg: SVGSVGElement): string[] {
  return [...svg.children].map(
    (child) => `${child.tagName.toLowerCase()}.${child.getAttribute('class') ?? ''}`
  )
}

function arcLength(svg: SVGSVGElement): number | null {
  const arc = svg.querySelector('circle.stroke-trivium-done')
  return arc ? Number(arc.getAttribute('stroke-dasharray')?.split(' ')[0]) : null
}

describe('TriviumTicketStatusIcon', () => {
  const kinds: TriviumTicketStatusIconKind[] = [
    'approval',
    'in-progress',
    'blocked',
    'open',
    'done',
    'abandoned'
  ]

  it('draws each ticket kind with its own shape and state color', () => {
    const shapes = new Map(
      kinds.map((kind) => {
        const shape = shapeOf(renderIcon(<TriviumTicketStatusIcon kind={kind} />))
        cleanup()
        return [kind, shape]
      })
    )
    expect(shapes.get('open')).toEqual(['circle.stroke-muted-foreground'])
    expect(shapes.get('in-progress')).toEqual([
      'circle.stroke-trivium-progress',
      'path.fill-trivium-progress'
    ])
    expect(shapes.get('blocked')).toEqual([
      'circle.stroke-trivium-blocked',
      'path.stroke-trivium-blocked',
      'circle.fill-trivium-blocked'
    ])
    expect(shapes.get('done')).toEqual(['circle.fill-trivium-done', 'path.stroke-trivium-on-color'])
    expect(shapes.get('abandoned')).toEqual([
      'circle.fill-muted-foreground/60',
      'path.stroke-trivium-on-color'
    ])
    expect(new Set([...shapes.values()].map((shape) => shape.join('|'))).size).toBe(kinds.length)
  })

  it('marks done with a check and abandoned with an x', () => {
    expect(
      renderIcon(<TriviumTicketStatusIcon kind="done" />)
        .querySelector('path')
        ?.getAttribute('d')
    ).toBe(CHECK)
    cleanup()
    expect(
      renderIcon(<TriviumTicketStatusIcon kind="abandoned" />)
        .querySelector('path')
        ?.getAttribute('d')
    ).toBe('m5.7 5.7 4.6 4.6m0-4.6-4.6 4.6')
  })

  it('draws approval as the lucide bell outline in the decision color, matched to the circles', () => {
    const svg = renderIcon(<TriviumTicketStatusIcon kind="approval" />)
    const bell = svg.querySelector('svg.lucide-bell')
    expect(bell).not.toBeNull()
    expect(bell?.getAttribute('class')).toContain('text-trivium-decision')
    expect(bell?.getAttribute('fill')).toBe('none')
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
    // The bell's stroke, scaled into the 16-unit frame, equals the circles' 1.6.
    const width = Number(bell?.getAttribute('width'))
    expect((Number(bell?.getAttribute('stroke-width')) * width) / 24).toBeCloseTo(1.6, 5)
    expect(Number(bell?.getAttribute('x')) * 2 + width).toBe(16)
  })

  it('shares one 16-unit frame at 14px by default and takes a size', () => {
    const svg = renderIcon(<TriviumTicketStatusIcon kind="open" />)
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg.getAttribute('width')).toBe('14')
    expect(svg.getAttribute('height')).toBe('14')
    expect(svg.dataset.triviumIcon).toBe('ticket-status')
    expect(svg.dataset.value).toBe('open')
    cleanup()
    expect(
      renderIcon(<TriviumTicketStatusIcon kind="open" size={12} />).getAttribute('width')
    ).toBe('12')
  })

  it('is decorative without a label and an image named by its label', () => {
    const decorative = renderIcon(<TriviumTicketStatusIcon kind="blocked" />)
    expect(decorative.getAttribute('aria-hidden')).toBe('true')
    expect(decorative.getAttribute('role')).toBeNull()
    cleanup()
    render(<TriviumTicketStatusIcon kind="approval" label="Needs approval" />)
    const named = screen.getByRole('img', { name: 'Needs approval' })
    expect(named.getAttribute('aria-hidden')).toBeNull()
    expect(named.dataset.value).toBe('approval')
  })
})

describe('TriviumProgressRing', () => {
  it('draws the done arc in proportion to the fraction, from 12 o’clock clockwise', () => {
    for (const fraction of [0.1, 0.25, 0.5, 0.75]) {
      const svg = renderIcon(<TriviumProgressRing fraction={fraction} />)
      expect((arcLength(svg) ?? Number.NaN) / RING_LENGTH).toBeCloseTo(fraction, 2)
      expect(svg.querySelector('circle.stroke-trivium-done')?.getAttribute('transform')).toBe(
        'rotate(-90 8 8)'
      )
      expect(svg.dataset.value).toBe(String(fraction))
      cleanup()
    }
  })

  it('draws no arc at zero and clamps the arc above one', () => {
    for (const fraction of [0, -0.5, Number.NaN]) {
      const svg = renderIcon(<TriviumProgressRing fraction={fraction} />)
      expect(arcLength(svg)).toBeNull()
      expect(shapeOf(svg)).toEqual(['circle.stroke-trivium-line'])
      cleanup()
    }
    const full = arcLength(renderIcon(<TriviumProgressRing fraction={1} />))
    cleanup()
    const over = renderIcon(<TriviumProgressRing fraction={1.7} />)
    expect(arcLength(over)).toBe(full)
    expect(full ?? 0).toBeGreaterThanOrEqual(RING_LENGTH)
    expect(over.dataset.value).toBe('1')
  })

  it('dashes the neutral track only when asked', () => {
    const solid = renderIcon(<TriviumProgressRing fraction={0.5} />)
    expect(
      solid.querySelector('circle.stroke-trivium-line')?.getAttribute('stroke-dasharray')
    ).toBe(null)
    cleanup()
    const dashed = renderIcon(<TriviumProgressRing fraction={0.5} dashed />)
    expect(
      dashed.querySelector('circle.stroke-trivium-line')?.getAttribute('stroke-dasharray')
    ).toBe('2.4 2')
    expect(arcLength(dashed) ?? 0).toBeGreaterThan(0)
  })

  it('takes a label', () => {
    render(<TriviumProgressRing fraction={0.3} label="3 of 10 tickets done" />)
    expect(screen.getByRole('img', { name: '3 of 10 tickets done' })).toBeTruthy()
  })
})

describe('TriviumMilestoneDiamond', () => {
  it('fills with the decision color only for the milestone under review', () => {
    expect(shapeOf(renderIcon(<TriviumMilestoneDiamond />))).toEqual([
      'path.stroke-muted-foreground'
    ])
    cleanup()
    const review = renderIcon(<TriviumMilestoneDiamond review />)
    expect(shapeOf(review)).toEqual(['path.fill-trivium-decision stroke-trivium-decision'])
    expect(review.dataset.value).toBe('review')
  })
})

describe('TriviumTicketGroupIcon', () => {
  it('draws two stacked muted bars', () => {
    expect(shapeOf(renderIcon(<TriviumTicketGroupIcon />))).toEqual([
      'rect.stroke-muted-foreground',
      'rect.stroke-muted-foreground'
    ])
  })
})

describe('TriviumOutcomeIcon', () => {
  it('draws a different glyph for each outcome', () => {
    const outcomes: TriviumOutcomeIconKind[] = ['unassessed', 'achieved', 'not-achieved']
    const svgs = outcomes.map((outcome) => renderIcon(<TriviumOutcomeIcon outcome={outcome} />))
    const [unassessed, achieved, notAchieved] = svgs
    expect(shapeOf(unassessed)).toEqual(['circle.stroke-muted-foreground'])
    expect(unassessed.querySelector('circle')?.getAttribute('stroke-dasharray')).toBe('2.2 2.2')
    expect(shapeOf(achieved)).toEqual([
      'circle.fill-trivium-success',
      'path.stroke-trivium-on-color'
    ])
    expect(achieved.querySelector('path')?.getAttribute('d')).toBe(CHECK)
    expect(shapeOf(notAchieved)).toEqual([
      'circle.stroke-trivium-blocked',
      'path.stroke-trivium-blocked'
    ])
    expect(svgs.map((svg) => svg.dataset.value)).toEqual(outcomes)
  })
})

describe('Trivium icons: contract edges', () => {
  const statusKinds = ['approval', 'in-progress', 'blocked', 'open', 'done', 'abandoned'] as const
  const outcomes = ['unassessed', 'achieved', 'not-achieved'] as const

  function everyIcon(
    labelFor: (name: string) => string | undefined = () => undefined
  ): [string, ReactElement][] {
    const makers: [string, (label?: string) => ReactElement][] = [
      ...statusKinds.map((kind): [string, (label?: string) => ReactElement] => [
        `status ${kind}`,
        (label) => <TriviumTicketStatusIcon kind={kind} label={label} />
      ]),
      ['ring', (label) => <TriviumProgressRing fraction={0.4} label={label} />],
      ['dashed ring', (label) => <TriviumProgressRing fraction={0.4} dashed label={label} />],
      ['diamond', (label) => <TriviumMilestoneDiamond label={label} />],
      ['review diamond', (label) => <TriviumMilestoneDiamond review label={label} />],
      ['ticket group', (label) => <TriviumTicketGroupIcon label={label} />],
      ...outcomes.map((outcome): [string, (label?: string) => ReactElement] => [
        `outcome ${outcome}`,
        (label) => <TriviumOutcomeIcon outcome={outcome} label={label} />
      ])
    ]
    return makers.map(([name, make]) => [name, make(labelFor(name))])
  }

  it('declares the same six ticket kinds and three outcomes as the model', () => {
    expectTypeOf<TriviumTicketStatusIconKind>().toEqualTypeOf<(typeof statusKinds)[number]>()
    expectTypeOf<TriviumOutcomeIconKind>().toEqualTypeOf<(typeof outcomes)[number]>()
  })

  it('draws every icon in the 16-unit frame at 14px, decorative without a label', () => {
    for (const [name, icon] of everyIcon()) {
      const svg = renderIcon(icon)
      expect([name, svg.getAttribute('viewBox')]).toEqual([name, '0 0 16 16'])
      expect([name, svg.getAttribute('width'), svg.getAttribute('height')]).toEqual([
        name,
        '14',
        '14'
      ])
      expect([name, svg.getAttribute('aria-hidden'), svg.getAttribute('role')]).toEqual([
        name,
        'true',
        null
      ])
      cleanup()
    }
  })

  it('turns every icon into a named image when a label is given, and not for an empty one', () => {
    for (const [name, icon] of everyIcon((iconName) => `Label for ${iconName}`)) {
      render(icon)
      const named = screen.getByRole('img', { name: `Label for ${name}` })
      expect([name, named.getAttribute('aria-hidden')]).toEqual([name, null])
      cleanup()
    }
    for (const [name, icon] of everyIcon(() => '')) {
      const svg = renderIcon(icon)
      expect([name, svg.getAttribute('aria-hidden'), svg.getAttribute('role')]).toEqual([
        name,
        'true',
        null
      ])
      cleanup()
    }
  })

  it('colors every shape only through the trivium tokens or muted-foreground', () => {
    const tokenClass =
      /^(fill|stroke|text)-(trivium-(decision|progress|blocked|done|new|success|on-color|line|line-strong)|muted-foreground(\/\d+)?)$/
    for (const [name, icon] of everyIcon()) {
      const svg = renderIcon(icon)
      for (const shape of svg.querySelectorAll('*')) {
        const colorClasses = (shape.getAttribute('class') ?? '')
          .split(/\s+/)
          .filter((token) => /^(fill|stroke|text|bg|border)-/.test(token))
        for (const token of colorClasses) {
          expect([name, token]).toEqual([name, expect.stringMatching(tokenClass)])
        }
        for (const attribute of ['fill', 'stroke', 'color']) {
          const value = shape.getAttribute(attribute)
          if (value !== null) {
            expect([name, attribute, value]).toEqual([
              name,
              attribute,
              expect.stringMatching(/^(none|currentColor)$/)
            ])
          }
        }
      }
      cleanup()
    }
  })

  it('clamps an infinite fraction like any other out-of-range value', () => {
    expect(arcLength(renderIcon(<TriviumProgressRing fraction={Number.NEGATIVE_INFINITY} />))).toBe(
      null
    )
    cleanup()
    const full = arcLength(renderIcon(<TriviumProgressRing fraction={1} />))
    cleanup()
    // "Clamped above 1": +Infinity is above 1, so it draws the full arc.
    expect(arcLength(renderIcon(<TriviumProgressRing fraction={Number.POSITIVE_INFINITY} />))).toBe(
      full
    )
  })

  it('draws a sliver of arc for any fraction above zero and keeps a dashed track at zero', () => {
    const sliver = arcLength(renderIcon(<TriviumProgressRing fraction={0.001} />))
    expect(sliver ?? 0).toBeGreaterThan(0)
    expect((sliver ?? 0) / RING_LENGTH).toBeLessThan(0.01)
    cleanup()
    const emptyDashed = renderIcon(<TriviumProgressRing fraction={0} dashed />)
    expect(shapeOf(emptyDashed)).toEqual(['circle.stroke-trivium-line'])
    expect(emptyDashed.querySelector('circle')?.getAttribute('stroke-dasharray')).toBe('2.4 2')
  })
})
