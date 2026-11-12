import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DataTable, type DataTableColumn } from '~/components/data-table'

interface Row {
  id: string
  label: string
  value: number
  children: Row[]
}

const rows: Row[] = [
  {
    id: 'person',
    label: 'Personne A',
    value: 10,
    children: [
      {
        id: 'provider',
        label: 'opencode-go',
        value: 7,
        children: [{ id: 'model', label: 'deepseek', value: 7, children: [] }],
      },
    ],
  },
]

const columns: DataTableColumn<Row>[] = [
  { key: 'label', header: 'Nom', cell: (row) => row.label },
  { key: 'value', header: 'Valeur', align: 'right', cell: (row) => row.value },
]

describe('DataTable', () => {
  it('expands person, then provider, down to model rows', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        caption="Test"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.label}
        getSubRows={(row) => row.children}
      />,
    )
    expect(screen.queryByText('opencode-go')).not.toBeInTheDocument()
    const expand = screen.getByRole('button', { name: 'Déplier Personne A' })
    await user.click(expand)
    expect(expand).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('opencode-go')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Déplier opencode-go' }))
    expect(screen.getByText('deepseek')).toBeInTheDocument()
  })

  it('renders a useful empty label', () => {
    render(
      <DataTable
        caption="Vide"
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.label}
      />,
    )
    expect(screen.getByText('Aucune ligne à afficher')).toBeInTheDocument()
  })
})
