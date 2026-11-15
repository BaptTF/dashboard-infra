import { Database, Users } from 'lucide-react'
import { DataTable, type DataTableColumn } from '~/components/data-table'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { Badge } from '~/components/ui/badge'
import {
  formatCurrency,
  formatDecimal,
  formatPercent,
  formatTokens,
  formatTokensExact,
} from '~/lib/format'
import {
  buildHermesRows,
  buildSpendRows,
  groupHermesByProvider,
  groupSpendByProvider,
  type HermesViewRow,
  type SpendGrouping,
  type SpendViewRow,
} from '~/lib/spend-view'
import { cn } from '~/lib/utils'
import type { LeoUser, SpendReport } from '~/lib/types'

const secondary = 'hidden md:table-cell'

function RowLabel({
  label,
  depth,
  rank,
  share,
}: {
  label: string
  depth: number
  rank?: number
  share?: number
}) {
  return (
    <p
      className={cn(
        'break-words',
        depth === 0 && 'text-sm font-semibold',
        depth === 1 && 'text-sm font-medium',
        depth >= 2 && 'text-muted-foreground text-[13px] font-normal',
      )}
    >
      {label}
      {depth === 0 && rank != null && share != null ? (
        <span className="text-muted-foreground ml-2 text-[11px] font-normal">
          #{rank} · {formatPercent(share)}
        </span>
      ) : null}
    </p>
  )
}

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

function spendColumns(grouping: SpendGrouping): DataTableColumn<SpendViewRow>[] {
  return [
    {
      key: 'name',
      header: grouping === 'provider' ? 'Fournisseur · clé · modèle' : 'Clé · fournisseur · modèle',
      cell: (row, depth) => (
        <div>
          <RowLabel label={row.label} depth={depth} rank={row.rank} share={row.shareOfCost} />
          {row.kind === 'model' &&
          row.cost > 0 &&
          row.tokensIn + row.tokensOut + row.cacheRead === 0 ? (
            <Badge
              variant="muted"
              className="mt-1"
              title="Coût reconstruit sans compteur de tokens associé"
            >
              coût seul, sans tokens
            </Badge>
          ) : null}
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
}

function hermesColumns(grouping: SpendGrouping): DataTableColumn<HermesViewRow>[] {
  return [
    {
      key: 'name',
      header:
        grouping === 'provider'
          ? 'Fournisseur · personne · modèle'
          : 'Personne · fournisseur · modèle',
      cell: (row, depth) => (
        <div>
          <RowLabel label={row.label} depth={depth} rank={row.rank} share={row.shareOfCost} />
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
      cell: (row) => (
        <span className="tnum text-sm font-medium">{formatCurrency(row.costUsd)}</span>
      ),
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
      cell: (row) =>
        row.sessionsDisplay === 'detail' ? (
          <span
            className="text-muted-foreground text-xs"
            title="Détail par modèle, visible en dépliant. Ces sessions ne s'ajoutent pas au total des personnes."
          >
            détail
          </span>
        ) : (
          <span className="tnum" title="Sessions comptées une fois pour cette ligne.">
            {formatDecimal(row.sessions)}
          </span>
        ),
    },
  ]
}

export function BifrostTable({
  report,
  onlyKeys,
  grouping,
}: {
  report: SpendReport
  onlyKeys?: string[]
  grouping: SpendGrouping
}) {
  const byKey = buildSpendRows(report.people, 'bifrost').filter(
    (row) => !onlyKeys || onlyKeys.includes(row.label),
  )
  const rows = grouping === 'provider' ? groupSpendByProvider(byKey) : byKey
  const scope =
    onlyKeys && onlyKeys.length === 1
      ? grouping === 'provider'
        ? `Une seule clé (${onlyKeys[0]}) : les fournisseurs classent ses modèles. `
        : `Vue limitée à la clé ${onlyKeys[0]}. `
      : 'Toutes les clés, hermes-leo et hermes-lea incluses. '
  const grouped =
    grouping === 'provider'
      ? 'Regroupé par fournisseur, du plus coûteux au moins coûteux, avec le rang et la part du coût. '
      : ''

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Database className="size-3.5" aria-hidden="true" />
          {grouping === 'provider' ? 'Fournisseurs Bifrost' : 'Clés Bifrost'}
        </span>
      }
      description={`${grouped}${scope}La vue Hermes par personne est une source distincte, jamais ajoutée. Les cartes et la courbe restent par clé.`}
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
          caption={
            grouping === 'provider'
              ? 'Consommation Bifrost par fournisseur, dépliable jusqu’aux modèles.'
              : 'Consommation Bifrost par clé, dépliable jusqu’aux modèles.'
          }
          columns={spendColumns(grouping)}
          rows={rows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.label}
          getSubRows={(row) => row.children}
          footer={spendFooter(rows)}
        />
      )}
    </Panel>
  )
}

function spendFooter(rows: SpendViewRow[]) {
  const total = rows.reduce(
    (sum, row) => ({
      cost: sum.cost + row.cost,
      tokensIn: sum.tokensIn + row.tokensIn,
      tokensOut: sum.tokensOut + row.tokensOut,
      cacheRead: sum.cacheRead + row.cacheRead,
    }),
    { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 },
  )
  return [
    'Total',
    formatCurrency(total.cost),
    formatTokens(total.tokensIn),
    formatTokens(total.cacheRead),
    formatTokens(total.tokensOut),
  ]
}

export function HermesTable({
  title,
  description,
  users,
  other,
  otherLabel,
  agent,
  grouping,
}: {
  title: string
  description: string
  users: LeoUser[]
  other: LeoUser | null
  otherLabel: string
  agent: 'leo' | 'lea'
  grouping: SpendGrouping
}) {
  const byPerson = buildHermesRows(users, other, otherLabel)
  const rows = grouping === 'provider' ? groupHermesByProvider(byPerson) : byPerson
  const personSessions = byPerson.reduce((sum, row) => sum + row.sessions, 0)
  const heading =
    grouping === 'provider' ? `Hermes ${agent === 'leo' ? 'Léo' : 'Léa'} · fournisseurs` : title

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Users className="size-3.5" aria-hidden="true" />
          {heading}
        </span>
      }
      description={
        grouping === 'provider'
          ? `Regroupé par fournisseur, du plus coûteux au moins coûteux. ${description} Le total des sessions compte chaque session une fois ; « détail » ouvre le décompte par modèle, qui ne s'y ajoute pas.`
          : description
      }
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
          caption={
            grouping === 'provider'
              ? `Consommation Hermes ${agent} par fournisseur, dépliable jusqu’aux modèles.`
              : `Consommation Hermes ${agent}, dépliable jusqu’aux modèles.`
          }
          columns={hermesColumns(grouping)}
          rows={rows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.label}
          getSubRows={(row) => row.children}
          footer={hermesFooter(rows, grouping === 'provider' ? personSessions : undefined)}
        />
      )}
    </Panel>
  )
}

function hermesFooter(rows: HermesViewRow[], personSessions?: number) {
  const total = rows.reduce(
    (sum, row) => ({
      costUsd: sum.costUsd + row.costUsd,
      tokensIn: sum.tokensIn + row.tokensIn,
      tokensOut: sum.tokensOut + row.tokensOut,
      cacheRead: sum.cacheRead + row.cacheRead,
      cacheWrite: sum.cacheWrite + row.cacheWrite,
      sessions: sum.sessions + row.sessions,
    }),
    { costUsd: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, sessions: 0 },
  )
  return [
    'Total',
    formatCurrency(total.costUsd),
    formatTokens(total.tokensIn),
    formatTokens(total.cacheRead),
    formatTokens(total.cacheWrite),
    formatTokens(total.tokensOut),
    formatDecimal(personSessions ?? total.sessions),
  ]
}
