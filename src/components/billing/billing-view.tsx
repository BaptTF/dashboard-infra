import { Receipt, ShoppingBag, Wallet } from 'lucide-react'
import {
  billingAccountLabel,
  billingItemLabel,
  billingProviderLabel,
  billingQualityLabel,
  chargesByMonth,
  eurosEquivalent,
  formatBillingMonth,
  oneTimeCharges,
  totalsByCurrency,
} from '~/lib/billing'
import { formatMoney } from '~/lib/format'
import type { BillingCharge, BillingMonthly, BillingQuality, BillingRate } from '~/lib/types'
import { DataTable, type DataTableColumn } from '../data-table'
import { MetricCard } from '../metric-card'
import { Panel } from '../panel'
import { Badge } from '../ui/badge'

function qualityVariant(quality: BillingQuality): 'muted' | 'success' | 'warning' {
  if (quality === 'invoice') return 'success'
  if (quality === 'estimate') return 'warning'
  return 'muted'
}

function QualityBadge({ quality }: { quality: BillingQuality }) {
  return <Badge variant={qualityVariant(quality)}>{billingQualityLabel(quality)}</Badge>
}

function MoneyStack({ rows }: { rows: { currency: string; amount: number }[] }) {
  const totals = totalsByCurrency(rows)
  if (totals.length === 0) return <>—</>
  return (
    <span className="flex flex-col gap-0.5">
      {totals.map((total) => (
        <span key={total.currency}>{formatMoney(total.amount, total.currency)}</span>
      ))}
    </span>
  )
}

function euroHint(amount: number, currency: string, rates: BillingRate[]): string | null {
  if (currency === 'EUR') return null
  const euros = eurosEquivalent(amount, currency, rates)
  if (euros == null) return null
  return `≈ ${formatMoney(euros, 'EUR')}`
}

function lineLabel(provider: string, account: string, item: string): string {
  return `${billingProviderLabel(provider)} ${billingAccountLabel(provider, account)} ${billingItemLabel(item)}`
}

export function BillingSummary({
  charges,
  monthly,
}: {
  charges: BillingCharge[]
  monthly: BillingMonthly[]
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard
        label="Par mois"
        icon={Wallet}
        tone="primary"
        value={<MoneyStack rows={monthly} />}
        hint="Tarif en cours. Hetzner est le catalogue, pas une facture déjà payée."
      />
      <MetricCard
        label="Achats ponctuels"
        icon={ShoppingBag}
        value={<MoneyStack rows={oneTimeCharges(charges, monthly)} />}
        hint="Factures sans abonnement, comme un top-up. Déjà comprises dans Depuis toujours."
      />
      <MetricCard
        label="Depuis toujours"
        icon={Receipt}
        value={<MoneyStack rows={charges} />}
        hint="Abonnements et achats ponctuels. Le tarif en cours n'est pas ajouté."
      />
    </div>
  )
}

const monthlyColumns = (rates: BillingRate[]): DataTableColumn<BillingMonthly>[] => [
  {
    key: 'provider',
    header: 'Fournisseur',
    cell: (row) => billingProviderLabel(row.provider),
  },
  {
    key: 'account',
    header: 'Compte',
    cell: (row) => billingAccountLabel(row.provider, row.account),
  },
  {
    key: 'item',
    header: 'Poste',
    cell: (row) => billingItemLabel(row.item),
  },
  {
    key: 'quality',
    header: 'Qualité',
    cell: (row) => <QualityBadge quality={row.quality} />,
  },
  {
    key: 'amount',
    header: 'Montant',
    align: 'right',
    cell: (row) => {
      const hint = euroHint(row.amount, row.currency, rates)
      return (
        <span className="block text-right tabular-nums">
          {formatMoney(row.amount, row.currency)}
          {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
        </span>
      )
    },
  },
]

const chargeColumns = (rates: BillingRate[]): DataTableColumn<BillingCharge>[] => [
  {
    key: 'provider',
    header: 'Fournisseur',
    cell: (row) => billingProviderLabel(row.provider),
  },
  {
    key: 'account',
    header: 'Compte',
    cell: (row) => billingAccountLabel(row.provider, row.account),
  },
  {
    key: 'item',
    header: 'Poste',
    cell: (row) =>
      row.resource !== row.item
        ? `${billingItemLabel(row.item)} · ${row.resource}`
        : billingItemLabel(row.item),
  },
  {
    key: 'period',
    header: 'Période',
    cell: (row) => (
      <span className="tabular-nums">
        {row.periodStart} → {row.periodEnd}
      </span>
    ),
  },
  {
    key: 'quality',
    header: 'Qualité',
    cell: (row) => <QualityBadge quality={row.quality} />,
  },
  {
    key: 'amount',
    header: 'Montant',
    align: 'right',
    cell: (row) => {
      const hint = euroHint(row.amount, row.currency, rates)
      return (
        <span className="block text-right tabular-nums">
          {formatMoney(row.amount, row.currency)}
          {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
        </span>
      )
    },
  },
]

const monthColumns = (): DataTableColumn<{
  month: string
  totals: { currency: string; amount: number }[]
}>[] => [
  {
    key: 'month',
    header: 'Mois',
    cell: (row) => <span className="capitalize">{formatBillingMonth(row.month)}</span>,
  },
  {
    key: 'amount',
    header: 'Payé',
    align: 'right',
    cell: (row) => (
      <span className="block text-right">
        <MoneyStack rows={row.totals} />
      </span>
    ),
  },
]

export function BillingTables({
  charges,
  monthly,
  rates,
}: {
  charges: BillingCharge[]
  monthly: BillingMonthly[]
  rates: BillingRate[]
}) {
  const months = chargesByMonth(charges)
  const oneTime = oneTimeCharges(charges, monthly)
  return (
    <div className="space-y-5">
      <Panel
        title="Achats ponctuels"
        description="Factures qui ne correspondent à aucun tarif mensuel. Le top-up Vercel est ici."
      >
        <DataTable
          caption="Liste des achats ponctuels"
          columns={chargeColumns(rates)}
          rows={oneTime}
          getRowId={(row) =>
            [
              row.provider,
              row.account,
              row.item,
              row.resource,
              row.currency,
              row.quality,
              row.periodStart,
              row.periodEnd,
            ].join(':')
          }
          getRowLabel={(row) =>
            `${lineLabel(row.provider, row.account, row.item)} ${row.periodEnd}`
          }
          emptyLabel="Aucun achat ponctuel"
        />
      </Panel>
      <Panel
        title="Chaque mois"
        description="Une facture est rangée au mois de sa date de fin. L'estimation Hetzner n'y figure pas."
      >
        <DataTable
          caption="Totaux de chaque mois"
          columns={monthColumns()}
          rows={months}
          getRowId={(row) => row.month}
          getRowLabel={(row) => formatBillingMonth(row.month)}
          emptyLabel="Aucune facture"
        />
      </Panel>
      <Panel
        title="Prix en cours"
        description="Détail du tarif mensuel. OpenCode Go n'a pas de prix dans son API : la ligne existe seulement dans le relevé déclaré."
      >
        <DataTable
          caption="Prix mensuels en cours"
          columns={monthlyColumns(rates)}
          rows={monthly}
          getRowId={(row) =>
            [row.provider, row.account, row.item, row.resource, row.currency, row.quality].join(':')
          }
          getRowLabel={(row) => lineLabel(row.provider, row.account, row.item)}
          emptyLabel="Aucun prix en cours"
        />
      </Panel>
      <Panel
        title="Factures"
        description="Toutes les factures et les montants déclarés, sans filtre de période."
      >
        <DataTable
          caption="Toutes les factures"
          columns={chargeColumns(rates)}
          rows={charges}
          getRowId={(row) =>
            [
              row.provider,
              row.account,
              row.item,
              row.resource,
              row.currency,
              row.quality,
              row.periodStart,
              row.periodEnd,
            ].join(':')
          }
          getRowLabel={(row) =>
            `${lineLabel(row.provider, row.account, row.item)} ${row.periodEnd}`
          }
          emptyLabel="Aucune facture"
        />
      </Panel>
    </div>
  )
}
