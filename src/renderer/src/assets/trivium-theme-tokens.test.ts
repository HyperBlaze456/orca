import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainCss = fs.readFileSync(new URL('./main.css', import.meta.url), 'utf8')

function blockBody(opening: RegExp): string {
  const match = opening.exec(mainCss)
  expect(match).not.toBeNull()
  const bodyStart = (match?.index ?? 0) + (match?.[0].length ?? 0)
  return mainCss.slice(bodyStart, mainCss.indexOf('\n}', bodyStart))
}

// Trivium custom properties declared directly in a block, comments stripped.
function triviumDeclarations(body: string, prefix: string): Map<string, string> {
  const declarations = new Map<string, string>()
  const source = body.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of source.matchAll(new RegExp(`(${prefix}[\\w-]+):\\s*([^;]+);`, 'g'))) {
    declarations.set(match[1], match[2].trim())
  }
  return declarations
}

const mix = (percent: number): string =>
  `color-mix(in srgb, var(--foreground) ${percent}%, var(--background))`

const LIGHT: Record<string, string> = {
  '--trivium-decision': '#ea580c',
  '--trivium-progress': 'var(--workspace-status-progress)',
  '--trivium-blocked': 'var(--destructive)',
  '--trivium-done': '#5e6ad2',
  '--trivium-new': '#2563eb',
  '--trivium-success': 'var(--status-success)',
  '--trivium-on-color': '#fff',
  '--trivium-line': mix(20),
  '--trivium-line-strong': mix(80),
  '--trivium-row-hover': mix(4),
  '--trivium-row-selected': mix(9)
}

// Only what differs from light; aliases and line-strong re-resolve on <html class="dark">.
const DARK_OVERRIDES: Record<string, string> = {
  '--trivium-decision': '#f97316',
  '--trivium-done': '#7c84e3',
  '--trivium-new': '#60a5fa',
  '--trivium-on-color': '#0a0a0a',
  '--trivium-line': mix(24),
  '--trivium-row-hover': mix(5),
  '--trivium-row-selected': mix(13)
}

describe('Trivium color tokens in main.css', () => {
  const root = triviumDeclarations(blockBody(/\n:root\s*{/), '--trivium-')
  const dark = triviumDeclarations(blockBody(/\n\.dark\s*{/), '--trivium-')
  const theme = triviumDeclarations(blockBody(/@theme inline\s*{/), '--color-trivium-')

  it('declares every light value in :root', () => {
    expect(Object.fromEntries(root)).toEqual(LIGHT)
  })

  it('overrides in .dark only the values that differ', () => {
    expect(Object.fromEntries(dark)).toEqual(DARK_OVERRIDES)
  })

  it('exposes each token to Tailwind as --color-trivium-*', () => {
    expect(Object.fromEntries(theme)).toEqual(
      Object.fromEntries(
        Object.keys(LIGHT).map((token) => [
          token.replace('--trivium-', '--color-trivium-'),
          `var(${token})`
        ])
      )
    )
  })

  it('aliases the Orca roles for progress, blocked and success instead of copying them', () => {
    for (const alias of ['--trivium-progress', '--trivium-blocked', '--trivium-success']) {
      expect(root.get(alias)).toMatch(/^var\(--[\w-]+\)$/)
      expect(dark.has(alias)).toBe(false)
    }
  })
})
