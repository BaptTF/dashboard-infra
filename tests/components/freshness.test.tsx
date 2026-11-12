import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FreshnessBadge, type FreshnessState } from '~/components/freshness'

function state(overrides: Partial<FreshnessState>): FreshnessState {
  return {
    fetchedAt: new Date().toISOString(),
    lastSuccessAt: Date.now(),
    stale: false,
    source: 'test',
    ...overrides,
  }
}

describe('FreshnessBadge', () => {
  it('announces a neutral loading state before the first response', () => {
    render(
      <FreshnessBadge state={state({ fetchedAt: null, lastSuccessAt: null, loading: true })} />,
    )
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(screen.queryByText('Aucune collecte reçue')).not.toBeInTheDocument()
  })

  it('keeps a compact age on mobile for stale-enough collections', () => {
    const now = Date.now()
    render(
      <FreshnessBadge
        compact
        state={state({
          fetchedAt: new Date(now).toISOString(),
          lastSuccessAt: now - 3 * 60 * 1000,
        })}
      />,
    )
    expect(screen.getByText('À jour · 3 min')).toBeInTheDocument()
  })

  it('does not add a long age when the collection is immediate', () => {
    const now = Date.now()
    render(
      <FreshnessBadge
        compact
        state={state({
          fetchedAt: new Date(now).toISOString(),
          lastSuccessAt: now,
        })}
      />,
    )
    expect(screen.getByText('À jour')).toBeInTheDocument()
    expect(screen.queryByText(/À jour · à l/)).not.toBeInTheDocument()
  })
})
