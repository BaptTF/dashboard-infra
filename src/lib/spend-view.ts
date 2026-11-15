import type {
  LeoModel,
  LeoProvider,
  LeoUser,
  LeoTotals,
  ModelSpend,
  PersonSpend,
  ProviderSpend,
  SpendOrigin,
} from './types'

export type SpendSource = 'all' | 'bifrost' | 'leo' | 'lea'

/** `key` keeps clé/personne → fournisseur → modèle. `provider` flips the first level. */
export type SpendGrouping = 'key' | 'provider'

export function normalizeSpendGrouping(value: unknown): SpendGrouping {
  return value === 'provider' ? 'provider' : 'key'
}

/** The Bifrost key behind a person filter, when there is one. */
export function selectedBifrostKey(source: SpendSource): 'hermes-leo' | 'hermes-lea' | null {
  if (source === 'leo') return 'hermes-leo'
  if (source === 'lea') return 'hermes-lea'
  return null
}

/** One source filter drives cards, tables and the curve together. */
export function includesBifrost(source: SpendSource): boolean {
  return source === 'all' || source === 'bifrost' || source === 'leo' || source === 'lea'
}

export function includesAgent(source: SpendSource, agent: 'leo' | 'lea'): boolean {
  return source === 'all' || source === agent
}

export interface SpendViewRow {
  id: string
  label: string
  kind: 'person' | 'provider' | 'model'
  origin: SpendOrigin
  provider: string
  model: string
  cost: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  /** Set on a provider grouping's top rows: 1 is the most expensive. */
  rank?: number
  /** Share of the top-level cost in a provider grouping. */
  shareOfCost?: number
  children: SpendViewRow[]
}

function personToRow(person: PersonSpend): SpendViewRow {
  return {
    id: `person:${person.virtualKey}`,
    label: person.virtualKey,
    kind: 'person',
    origin: person.origin,
    provider: '',
    model: '',
    cost: person.cost,
    tokensIn: person.tokensIn,
    tokensOut: person.tokensOut,
    cacheRead: person.cacheRead,
    children: person.providers.map((provider) => providerToRow(person.virtualKey, provider)),
  }
}

function providerToRow(person: string, provider: ProviderSpend): SpendViewRow {
  return {
    id: `provider:${person}:${provider.provider}`,
    label: provider.provider || 'Sans fournisseur',
    kind: 'provider',
    origin: 'bifrost',
    provider: provider.provider,
    model: '',
    cost: provider.cost,
    tokensIn: provider.tokensIn,
    tokensOut: provider.tokensOut,
    cacheRead: provider.cacheRead,
    children: provider.models.map((model) => modelToRow(person, provider.provider, model)),
  }
}

function modelToRow(person: string, provider: string, model: ModelSpend): SpendViewRow {
  return {
    id: `model:${person}:${provider}:${model.model}`,
    label: model.model || 'Modèle inconnu',
    kind: 'model',
    origin: 'bifrost',
    provider,
    model: model.model,
    cost: model.cost,
    tokensIn: model.tokensIn,
    tokensOut: model.tokensOut,
    cacheRead: model.cacheRead,
    children: [],
  }
}

export function buildSpendRows(people: PersonSpend[], origin?: SpendOrigin): SpendViewRow[] {
  return people.filter((person) => origin == null || person.origin === origin).map(personToRow)
}

function bySpendCost(a: SpendViewRow, b: SpendViewRow): number {
  return b.cost - a.cost || a.label.localeCompare(b.label, 'fr')
}

/**
 * Lifts each provider (opencode-go, bedrock, …) above the keys that use it.
 * Input rows must be the key → provider → model tree. Model rows are reused.
 */
export function groupSpendByProvider(rows: SpendViewRow[]): SpendViewRow[] {
  const groups = new Map<string, SpendViewRow>()
  for (const person of rows) {
    for (const provider of person.children) {
      let group = groups.get(provider.provider)
      if (!group) {
        group = {
          id: `provider-group:${provider.provider}`,
          label: provider.label,
          kind: 'provider',
          origin: provider.origin,
          provider: provider.provider,
          model: '',
          cost: 0,
          tokensIn: 0,
          tokensOut: 0,
          cacheRead: 0,
          children: [],
        }
        groups.set(provider.provider, group)
      }
      group.cost += provider.cost
      group.tokensIn += provider.tokensIn
      group.tokensOut += provider.tokensOut
      group.cacheRead += provider.cacheRead
      group.children.push({
        id: `provider-group:${provider.provider}:${person.id}`,
        label: person.label,
        kind: 'person',
        origin: person.origin,
        provider: provider.provider,
        model: '',
        cost: provider.cost,
        tokensIn: provider.tokensIn,
        tokensOut: provider.tokensOut,
        cacheRead: provider.cacheRead,
        children: provider.children,
      })
    }
  }
  for (const group of groups.values()) group.children.sort(bySpendCost)
  return assignRanks([...groups.values()].sort(bySpendCost), (row) => row.cost)
}

export interface HermesViewRow {
  id: string
  label: string
  source: string
  kind: 'person' | 'provider' | 'model'
  provider: string
  model: string
  costUsd: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  sessions: number
  /** Set on a provider grouping's top rows: 1 is the most expensive. */
  rank?: number
  /** Share of the top-level cost in a provider grouping. */
  shareOfCost?: number
  /**
   * `detail` hides the rolled-up session count: model sessions must not be
   * added to the once-per-person total. The breakdown stays on the children.
   */
  sessionsDisplay?: 'amount' | 'detail'
  children: HermesViewRow[]
}

function totals(user: LeoTotals) {
  return {
    costUsd: user.costUsd,
    tokensIn: user.tokensIn,
    tokensOut: user.tokensOut,
    cacheRead: user.cacheRead,
    cacheWrite: user.cacheWrite,
    sessions: user.sessions,
  }
}

function leoPerson(user: LeoUser, label?: string): HermesViewRow {
  const id = `person:${user.source}:${user.user || 'other'}`
  return {
    id,
    label: label ?? (user.user || user.source),
    source: user.source,
    kind: 'person',
    provider: '',
    model: '',
    ...totals(user),
    children: user.providers.map((provider) => leoProvider(id, user.source, provider)),
  }
}

function leoProvider(parentId: string, source: string, provider: LeoProvider): HermesViewRow {
  const id = `${parentId}:provider:${provider.provider}`
  return {
    id,
    label: provider.provider || 'Sans fournisseur',
    source,
    kind: 'provider',
    provider: provider.provider,
    model: '',
    ...totals(provider),
    children: provider.models.map((model) => leoModel(id, source, provider.provider, model)),
  }
}

function leoModel(
  parentId: string,
  source: string,
  provider: string,
  model: LeoModel,
): HermesViewRow {
  return {
    id: `${parentId}:model:${model.model}`,
    label: model.model || 'Modèle inconnu',
    source,
    kind: 'model',
    provider,
    model: model.model,
    ...totals(model),
    children: [],
  }
}

export function buildHermesRows(
  users: LeoUser[],
  other: LeoUser | null,
  otherLabel: string,
): HermesViewRow[] {
  const rows = users.map((user) => leoPerson(user))
  if (other) rows.push(leoPerson(other, otherLabel))
  return rows
}

/** Sessions without a provider stay on the person and must not be added to a provider slice. */
const UNATTRIBUTED_PROVIDER = '\u0000'

function nearlyZero(value: number): number {
  return Math.abs(value) < 1e-6 ? 0 : value
}

function unattributedHermesSlice(person: HermesViewRow): HermesViewRow | null {
  const covered = person.children.reduce(
    (total, child) => ({
      costUsd: total.costUsd + child.costUsd,
      tokensIn: total.tokensIn + child.tokensIn,
      tokensOut: total.tokensOut + child.tokensOut,
      cacheRead: total.cacheRead + child.cacheRead,
      cacheWrite: total.cacheWrite + child.cacheWrite,
    }),
    { costUsd: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 },
  )
  const slice = {
    costUsd: nearlyZero(person.costUsd - covered.costUsd),
    tokensIn: nearlyZero(person.tokensIn - covered.tokensIn),
    tokensOut: nearlyZero(person.tokensOut - covered.tokensOut),
    cacheRead: nearlyZero(person.cacheRead - covered.cacheRead),
    cacheWrite: nearlyZero(person.cacheWrite - covered.cacheWrite),
    // Unscoped sessions are counted once on the person, never on a provider.
    sessions: person.sessions,
  }
  if (
    slice.costUsd === 0 &&
    slice.tokensIn === 0 &&
    slice.tokensOut === 0 &&
    slice.cacheRead === 0 &&
    slice.cacheWrite === 0 &&
    slice.sessions === 0
  ) {
    return null
  }
  return {
    id: `provider-group:unattributed:${person.id}`,
    label: person.label,
    source: person.source,
    kind: 'person',
    provider: '',
    model: '',
    ...slice,
    children: [],
  }
}

function byHermesCost(a: HermesViewRow, b: HermesViewRow): number {
  return b.costUsd - a.costUsd || a.label.localeCompare(b.label, 'fr')
}

/**
 * Lifts each provider above the people that use it. Cost and tokens that have
 * no provider — and sessions counted only on the person — stay under
 * « Sans fournisseur » so the pivot does not drop them.
 */
export function groupHermesByProvider(rows: HermesViewRow[]): HermesViewRow[] {
  const groups = new Map<string, HermesViewRow>()

  const ensure = (key: string, label: string): HermesViewRow => {
    let group = groups.get(key)
    if (!group) {
      group = {
        id: key === UNATTRIBUTED_PROVIDER ? 'provider-group:unattributed' : `provider-group:${key}`,
        label,
        source: '',
        kind: 'provider',
        provider: key === UNATTRIBUTED_PROVIDER ? '' : key,
        model: '',
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 0,
        sessionsDisplay: key === UNATTRIBUTED_PROVIDER ? 'amount' : 'detail',
        children: [],
      }
      groups.set(key, group)
    }
    return group
  }

  const add = (group: HermesViewRow, child: HermesViewRow) => {
    group.costUsd += child.costUsd
    group.tokensIn += child.tokensIn
    group.tokensOut += child.tokensOut
    group.cacheRead += child.cacheRead
    group.cacheWrite += child.cacheWrite
    // Model sessions stay on the children. Adding them here would make the
    // provider total look larger than the once-per-person session count.
    if (group.sessionsDisplay !== 'detail') group.sessions += child.sessions
    group.children.push(child)
  }

  for (const person of rows) {
    for (const provider of person.children) {
      add(ensure(provider.provider, provider.label), {
        id: `provider-group:${provider.provider}:${person.id}`,
        label: person.label,
        source: person.source,
        kind: 'person',
        provider: provider.provider,
        model: '',
        costUsd: provider.costUsd,
        tokensIn: provider.tokensIn,
        tokensOut: provider.tokensOut,
        cacheRead: provider.cacheRead,
        cacheWrite: provider.cacheWrite,
        sessions: provider.sessions,
        children: provider.children,
      })
    }
    const remainder = unattributedHermesSlice(person)
    if (remainder) add(ensure(UNATTRIBUTED_PROVIDER, 'Sans fournisseur'), remainder)
  }

  for (const group of groups.values()) group.children.sort(byHermesCost)
  return assignRanks([...groups.values()].sort(byHermesCost), (row) => row.costUsd)
}

function assignRanks<T extends { rank?: number; shareOfCost?: number }>(
  rows: T[],
  cost: (row: T) => number,
): T[] {
  const total = rows.reduce((sum, row) => sum + cost(row), 0)
  for (const [index, row] of rows.entries()) {
    row.rank = index + 1
    row.shareOfCost = total > 0 ? cost(row) / total : undefined
  }
  return rows
}
