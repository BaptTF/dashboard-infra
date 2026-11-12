import { Database, Users } from 'lucide-react'
import { DataTable, type DataTableColumn } from '~/components/data-table'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { formatCurrency, formatDecimal, formatTokens, formatTokensExact } from '~/lib/format'
import {
  buildHermesRows,
  buildSpendRows,
  type HermesViewRow,
  type SpendViewRow,
} from '~/lib/spend-view'
import type { LeoUser, SpendReport } from '~/lib/types'

const secondary = 'hidden md:table-cell'

function MobileStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="inline-flex items-baseline gap-1">
      <dt>{label}</dt>
      <dd className="tnum text-foreground font-medium" title={title}>
        {value}
      </dd>
    </div>
  )
}

const spendColumns: DataTableColumn<SpendViewRow>[] = [
  {
    key: 'name',
    header: 'Clé · fournisseur · modèle',
    cell: (row) => (
      <div>
        <p className="text-sm font-medium break-words">{row.label}</p>
        <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] md:hidden">
          <MobileStat
            label="Entrée"
            value={formatTokens(row.tokensIn)}
            title={formatTokensExact(row.tokensIn)}
          />
          <MobileStat
            label="Cache lu"
            value={formatTokens(row.cacheRead)}
            title={formatTokensExact(row.cacheRead)}
          />
          <MobileStat
            label="Sortie"
            value={formatTokens(row.tokensOut)}
            title={formatTokensExact(row.tokensOut)}
          />
        </dl>
      </div>
    ),
  },
  {
    key: 'cost',
    header: 'Coût',
    align: 'right',
    cell: (row) => <span className="tnum text-sm font-medium">{formatCurrency(row.cost)}</span>,
  },
  {
    key: 'in',
    header: 'Entrée',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.tokensIn)}>
        {formatTokens(row.tokensIn)}
      </span>
    ),
  },
  {
    key: 'cache',
    header: 'Cache lu',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.cacheRead)}>
        {formatTokens(row.cacheRead)}
      </span>
    ),
  },
  {
    key: 'out',
    header: 'Sortie',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.tokensOut)}>
        {formatTokens(row.tokensOut)}
      </span>
    ),
  },
]

const hermesColumns: DataTableColumn<HermesViewRow>[] = [
  {
    key: 'name',
    header: 'Personne · fournisseur · modèle',
    cell: (row) => (
      <div>
        <p className="text-sm font-medium break-words">{row.label}</p>
        <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] md:hidden">
          <MobileStat
            label="Entrée"
            value={formatTokens(row.tokensIn)}
            title={formatTokensExact(row.tokensIn)}
          />
          <MobileStat
            label="Cache lu"
            value={formatTokens(row.cacheRead)}
            title={formatTokensExact(row.cacheRead)}
          />
          <MobileStat
            label="Cache écrit"
            value={formatTokens(row.cacheWrite)}
            title={formatTokensExact(row.cacheWrite)}
          />
          <MobileStat
            label="Sortie"
            value={formatTokens(row.tokensOut)}
            title={formatTokensExact(row.tokensOut)}
          />
          <MobileStat label="Sessions" value={formatDecimal(row.sessions)} />
        </dl>
      </div>
    ),
  },
  {
    key: 'cost',
    header: 'Coût',
    align: 'right',
    cell: (row) => <span className="tnum text-sm font-medium">{formatCurrency(row.costUsd)}</span>,
  },
  {
    key: 'in',
    header: 'Entrée',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.tokensIn)}>
        {formatTokens(row.tokensIn)}
      </span>
    ),
  },
  {
    key: 'read',
    header: 'Cache lu',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.cacheRead)}>
        {formatTokens(row.cacheRead)}
      </span>
    ),
  },
  {
    key: 'write',
    header: 'Cache écrit',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.cacheWrite)}>
        {formatTokens(row.cacheWrite)}
      </span>
    ),
  },
  {
    key: 'out',
    header: 'Sortie',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => (
      <span className="tnum" title={formatTokensExact(row.tokensOut)}>
        {formatTokens(row.tokensOut)}
      </span>
    ),
  },
  {
    key: 'sessions',
    header: 'Sessions',
    align: 'right',
    className: secondary,
    headerClassName: secondary,
    cell: (row) => <span className="tnum">{formatDecimal(row.sessions)}</span>,
  },
]

export function BifrostTable({ report }: { report: SpendReport }) {
  const rows = buildSpendRows(report.people, 'bifrost')

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Database className="size-3.5" aria-hidden="true" />
          Clés Bifrost
        </span>
      }
      description="Coût, tokens et cache par clé, fournisseur puis modèle."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune clé Bifrost"
          description="Aucun compteur Bifrost ne porte de consommation sur cette fenêtre."
          icon={Database}
          className="py-6"
        />
      ) : (
        <DataTable
          caption="Consommation Bifrost par clé, dépliable jusqu’aux modèles."
          columns={spendColumns}
          rows={rows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.label}
          getSubRows={(row) => row.children}
        />
      )}
    </Panel>
  )
}

export function HermesTable({
  title,
  description,
  users,
  other,
  otherLabel,
  agent,
}: {
  title: string
  description: string
  users: LeoUser[]
  other: LeoUser | null
  otherLabel: string
  agent: 'leo' | 'lea'
}) {
  const rows = buildHermesRows(users, other, otherLabel)

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Users className="size-3.5" aria-hidden="true" />
          {title}
        </span>
      }
      description={description}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={`Aucune personne ${agent === 'leo' ? 'Léo' : 'Léa'}`}
          description="Les jauges Hermes sont absentes ou vides pour cette fenêtre."
          icon={Users}
          className="py-6"
        />
      ) : (
        <DataTable
          caption={`Consommation Hermes ${agent}, dépliable jusqu’aux modèles.`}
          columns={hermesColumns}
          rows={rows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.label}
          getSubRows={(row) => row.children}
        />
      )}
    </Panel>
  )
}
