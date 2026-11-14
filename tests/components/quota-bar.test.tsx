import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuotaBar } from '~/components/quota-bar'

describe('QuotaBar', () => {
  it('exposes consumed, elapsed and the budget markers to assistive technology', () => {
    render(
      <QuotaBar
        label="Mensuel · Go"
        window="monthly"
        usedRatio={0.63}
        elapsedRatio={0.41}
        severity={1}
        dryDays={2.6}
        resetAt={Math.floor(Date.now() / 1000) + 86400}
        provider="opencode"
      />,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '63')
    expect(bar).toHaveAttribute('aria-valuetext')
    expect(bar.getAttribute('aria-valuetext')).toContain('63')
    expect(bar.getAttribute('aria-valuetext')).toContain('41')
    expect(bar).toHaveAttribute('title', 'Repères de consommation à 80 % et 95 %')
    expect(screen.getByText(/Temps écoulé/)).toBeInTheDocument()
    expect(screen.getByText('Sous tension')).toBeInTheDocument()
  })

  it('does not show an elapsed marker for a rolling window', () => {
    render(
      <QuotaBar
        label="Glissant"
        window="rolling"
        usedRatio={0.3}
        elapsedRatio={0.4}
        severity={0}
        dryDays={0}
        resetAt={null}
        provider="opencode"
      />,
    )
    expect(screen.queryByText(/Temps écoulé/)).not.toBeInTheDocument()
    // Window invariants now live once in the provider header, not under every bar.
    expect(screen.queryByText(/Fenêtre glissante/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Consommé/)).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'title',
      'Repères de consommation à 70 % et 90 %',
    )
  })

  it('shows the exact reset date in Paris time', () => {
    render(
      <QuotaBar
        label="Mensuel · Total"
        window="monthly"
        usedRatio={0.5}
        elapsedRatio={0.4}
        severity={0}
        dryDays={null}
        resetAt={1796825165}
        provider="cursor"
      />,
    )
    expect(screen.getByText(/Reset le/)).toHaveTextContent(/9 déc. 2026, 15:06/)
  })

  it('uses 70/90 markers for Cursor absolute levels', () => {
    render(
      <QuotaBar
        label="Mensuel · Inclus"
        window="monthly"
        usedRatio={0.5}
        elapsedRatio={0.4}
        severity={0}
        dryDays={null}
        resetAt={null}
        provider="cursor"
      />,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'title',
      'Repères de consommation à 70 % et 90 %',
    )
  })
})
