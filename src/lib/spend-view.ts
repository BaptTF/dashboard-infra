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

/** One source filter drives cards, tables and the curve together. */
export function includesBifrost(source: SpendSource): boolean {
  return source === 'all' || source === 'bifrost'
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
    label: provider.provider || 'Fournisseur inconnu',
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
    label: provider.provider || 'Fournisseur inconnu',
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
