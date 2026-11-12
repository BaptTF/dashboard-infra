import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '~/components/theme-provider'
import { ThemeToggle } from '~/components/theme-toggle'

describe('ThemeToggle', () => {
  it('persists a manual dark theme', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /Thème/ }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Sombre' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem('dashboard-theme')).toBe('dark')
  })
})
