import type { UseQueryResult } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryState } from '~/components/query-state'

function fakeQuery<T>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as UseQueryResult<T>
}

describe('QueryState', () => {
  it('keeps previous data visible when a refresh fails', () => {
    render(
      <QueryState
        query={fakeQuery({ isError: true, data: { value: 42 }, error: new Error('boom') })}
      >
        {(data) => <p>Valeur {data.value}</p>}
      </QueryState>,
    )
    expect(screen.getByText('Valeur 42')).toBeInTheDocument()
    expect(screen.getByText('Mise à jour impossible')).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()
  })

  it('offers a retry when no data has ever loaded', async () => {
    const refetch = vi.fn()
    render(
      <QueryState
        query={fakeQuery<{ value: number }>({ isError: true, error: new Error('panne'), refetch })}
      >
        {() => <p>Jamais affiché</p>}
      </QueryState>,
    )
    expect(screen.queryByText('Jamais affiché')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('renders an empty state without inventing data', () => {
    render(
      <QueryState query={fakeQuery({ data: [] })} isEmpty={(data) => data.length === 0}>
        {() => <p>Jamais affiché</p>}
      </QueryState>,
    )
    expect(screen.getByText('Aucune donnée')).toBeInTheDocument()
  })

  it('shows a stale banner but keeps the data', () => {
    render(
      <QueryState
        query={fakeQuery({ data: { value: 1 } })}
        staleMessage="La collecte est ancienne."
      >
        {(data) => <p>Valeur {data.value}</p>}
      </QueryState>,
    )
    expect(screen.getByText('Données anciennes')).toBeInTheDocument()
    expect(screen.getByText('Valeur 1')).toBeInTheDocument()
  })
})
