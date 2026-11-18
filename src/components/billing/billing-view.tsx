import { Receipt, Wallet } from 'lucide-react'
import {
  billingAccountLabel,
  billingItemLabel,
  billingProviderLabel,
  billingQualityLabel,
  chargesForWindow,
  eurosEquivalent,
  totalsByCurrency,
} from '~/lib/billing'
import { formatMoney } from '~/lib/format'
import type {
  BillingCharge,
  BillingMonthly,
  BillingQuality,
  BillingRate,
  SpendWindow,
} from '~/lib/types'
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
  window,
  now,
}: {
  charges: BillingCharge[]
  monthly: BillingMonthly[]
  window: SpendWindow
  now: Date
}) {
  const visible = chargesForWindow(charges, now, window)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MetricCard
        label="Facturé sur la période"
        icon={Receipt}
        tone="primary"
        value={<MoneyStack rows={visible} />}
        hint="Chaque charge est rangée au mois de sa date de fin. Le prix en cours n'est pas ajouté."
      />
      <MetricCard
        label="Prix en cours"
        icon={Wallet}
        value={<MoneyStack rows={monthly} />}
        hint="Contabo et OpenCode sont des montants déclarés. Hetzner est le catalogue, pas une facture."
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

export function BillingTables({
  charges,
  monthly,
  rates,
  window,
  now,
}: {
  charges: BillingCharge[]
  monthly: BillingMonthly[]
  rates: BillingRate[]
  window: SpendWindow
  now: Date
}) {
  const visible = chargesForWindow(charges, now, window)
  return (
    <div className="space-y-5">
      <Panel
        title="Prix en cours"
        description="OpenCode Go n'a pas de prix dans son API. Une ligne apparaît ici seulement quand le relevé déclaré en contient une."
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
        title="Charges"
        description="Une ligne par période payée. Une estimation Hetzner n'y figure pas : elle n'est pas une facture."
      >
        <DataTable
          caption="Charges de la période affichée"
          columns={chargeColumns(rates)}
          rows={visible}
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
          emptyLabel="Aucune charge sur cette période"
        />
      </Panel>
    </div>
  )
}
