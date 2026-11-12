# dashboard-infra

Tableau de bord de monitoring des **abonnements IA** et de la **consommation Bifrost / Hermes**, alimenté par Prometheus en lecture seule.

Deux vues, une même source serveur :

| Route                              | Contenu                                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` — **Abonnements**              | Maillon faible, jours à sec, quotas OpenCode / Cursor / Devin, prix connu sur la carte du fournisseur, poids dans la carte OpenCode, collecte par abonnement et historique des quotas.       |
| `/consommation` — **Consommation** | Quatre indicateurs utiles (coût et tokens Bifrost, cache, coût Hermes), drill-down personne → fournisseur → modèle, filtre de source cohérent et courbe de coût avec granularité adaptative. |

L'interface est en français, les heures et fenêtres calendaires sont en **Europe/Paris**. Thème clair, sombre ou système, avec bascule manuelle persistée. Aucune donnée de production n'est versionnée dans ce dépôt public : le mock et les fixtures sont entièrement anonymisés.

## Stack

- **TanStack Start** (stable, Vite) + **TanStack Router** + **TanStack Query**
- **React 19** + **TypeScript**
- **Tailwind CSS 4** + composants **shadcn/ui** (Radix UI, CVA)
- **Apache ECharts** via imports ciblés
- **Vitest** + Testing Library, **Playwright** + **axe-core**
- **Nitro** (sortie `node-server`) et image Docker Node 24 LTS
- Flake Nix reproductible (Node 24 + Chromium Playwright)

## Démarrage

```bash
npm ci

# Application + mock Prometheus déterministe
npm run dev:mock
# → http://127.0.0.1:3000
# → mock sur http://127.0.0.1:9090
```

Sans `PROMETHEUS_URL`, le serveur de développement et les tests utilisent automatiquement le mock local. En production, l'absence de `PROMETHEUS_URL` laisse les sections explicitement vides, sans tentative réseau.

Autres commandes :

```bash
npm run dev            # application seule
npm run mock           # mock Prometheus seul (port 9090)
npm run build          # build TanStack Start + Nitro dans .output/
npm run start          # prod Node/Nitro, PORT=3000 (NODE_ENV=production)
npm run check          # format + lint + types + unit + build
npm run test:e2e       # Playwright + axe (démarre 3 serveurs de test)
```

### Scénarios du mock

```bash
MOCK_SCENARIO=stale npm run dev:mock
```

| Scénario      | Contenu                                                               |
| ------------- | --------------------------------------------------------------------- |
| `nominal`     | Quotas, coûts, poids, collecte, consommation Bifrost et Hermes.       |
| `empty`       | Toutes les réponses Prometheus sont vides.                            |
| `stale`       | Dernières données conservées, collecte et sidecar en échec.           |
| `partial`     | Collecte Cursor partielle et requête de dépense en erreur (HTTP 500). |
| `thresholds`  | Quotas à 82 %, 95 %, 97 %, 99 % et jours à sec.                       |
| `zero-weight` | Poids Bifrost à zéro, une valeur valide qui doit rester visible.      |
| `longnames`   | Abonnements, clés et modèles très longs.                              |

Le mock sert `/api/v1/query`, `/api/v1/query_range`, `/-/ready` et `/healthz`. Il est déterministe pour une même horloge ; `MOCK_NOW` peut fixer l'instant.

## Configuration serveur

| Variable                   | Défaut                  | Rôle                                                                                                                                              |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROMETHEUS_URL`           | — (mock en dev)         | Origine Prometheus, **sans** `/api/v1`, par exemple `http://prometheus-longterm.monitoring.svc.cluster.local:9090`. Jamais exposée au navigateur. |
| `PROMETHEUS_TIMEOUT_MS`    | `10000`                 | Timeout des requêtes Prometheus.                                                                                                                  |
| `PORT`                     | `3000`                  | Port d'écoute Node/Nitro.                                                                                                                         |
| `HOST`                     | `0.0.0.0` en image      | Adresse d'écoute.                                                                                                                                 |
| `APP_VERSION`              | `dev`                   | Version affichée par les healthchecks et les labels OCI.                                                                                          |
| `COLLECTION_STALE_SECONDS` | `900`                   | Seuil de fraîcheur de `ai_usage_collection_last_success_timestamp_seconds`.                                                                       |
| `WEIGHT_STALE_SECONDS`     | `600`                   | Seuil de fraîcheur du sidecar de poids.                                                                                                           |
| `MOCK_PROMETHEUS_URL`      | `http://127.0.0.1:9090` | Cible du mock en développement/test.                                                                                                              |
| `MOCK_PROMETHEUS=1`        | —                       | Force le mock hors développement (tests locaux uniquement).                                                                                       |
| `MOCK_SCENARIO`            | `nominal`               | Scénario du mock.                                                                                                                                 |

Aucun secret n'est requis par cette application. `PROMETHEUS_URL` est une configuration serveur ; les fonctions serveur appliquent `Cache-Control: private, no-store`.

## Contrat Prometheus

Toutes les requêtes sont **fixes**, construites côté serveur. Aucun texte du navigateur n'est concaténé dans du PromQL. Les métriques sont dédupliquées avec :

```promql
max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)
```

### Abonnements et quotas

| Métrique                                                            | Usage                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ai_usage_quota_used_ratio{provider,subscription,window,quota}`     | Consommé, ratio 0–1.                                                                     |
| `ai_usage_quota_reset_timestamp_seconds`                            | Reset de la fenêtre.                                                                     |
| `ai_usage_quota_elapsed_ratio`                                      | Temps écoulé, **informatif**.                                                            |
| `ai_usage_quota_dry_days`                                           | Jours à sec projetés, **informatif**.                                                    |
| `ai_usage_quota_budget_severity`                                    | Sévérité **absolue** fournie par l'exporteur : `0` tenu, `1` sous tension, `2` dérapage. |
| `ai_usage_subscription_monthly_cost_usd`                            | Coût contractuel mensuel.                                                                |
| `ai_usage_spend_usd{bucket}` / `ai_usage_spend_limit_usd{bucket}`   | Dépense hors forfait et limite.                                                          |
| `ai_usage_acu_consumed{product}`                                    | Consommation ACU Devin par produit.                                                      |
| `ai_usage_acu_cycle_start_timestamp_seconds{provider,subscription}` | Début du cycle ACU Devin.                                                                |
| `ai_usage_acu_cycle_reset_timestamp_seconds{provider,subscription}` | **Reset ACU** affiché tel quel.                                                          |
| `ai_usage_collection_success`                                       | Succès de collecte (`1`/`0`).                                                            |
| `ai_usage_collection_partial`                                       | Collecte partielle (`1`/`0`).                                                            |
| `ai_usage_collection_last_success_timestamp_seconds`                | Dernier succès.                                                                          |
| `ai_usage_collection_duration_seconds`                              | Durée de collecte, collectée mais non affichée dans la V1 compacte.                      |

Règles de sévérité respectées : **Cursor et Devin** utilisent le niveau absolu de `ai_usage_quota_budget_severity` ; `elapsed_ratio` et `dry_days` restent purement informatifs. **OpenCode** monthly/weekly suit le budget calculé (ComputeBudget), et rolling_5h reste un seuil absolu. Le dashboard ne recalcule jamais la sévérité d'un quota à partir du rythme.

Les fenêtres `monthly`, `weekly`, `daily` et `rolling` sont affichées séparément, avec des libellés français (`Quota total`, `Forfait inclus`, `API`, `Hors forfait`, `Grok`). Les barres montrent le consommé, le temps écoulé et les repères discrets à 80 % / 95 % ; la fenêtre glissante n'affiche pas de repère de temps écoulé. Les jours à sec signifient **jours projetés sans quota avant le reset** ; ils restent neutres pour Cursor et Devin. Le reset est sur une ligne distincte.

La collecte est suivie **par abonnement** : un abonnement OpenCode en échec n'est jamais masqué par les autres. La carte du fournisseur agrège les statuts en gardant le plus dégradé, et le bandeau global suit le maillon le plus faible.

### Poids Bifrost

| Métrique                                                    | Usage                                              |
| ----------------------------------------------------------- | -------------------------------------------------- |
| `bifrost_provider_key_weight{provider,subscription,key}`    | Dernier poids observé. Zéro est une valeur valide. |
| `bifrost_weight_sidecar_observation_success`                | Dernière observation réussie.                      |
| `bifrost_weight_sidecar_last_observation_timestamp_seconds` | Horodatage de la dernière observation réussie.     |

La jointure avec les abonnements normalise **les deux côtés** :

- `provider` : `opencode-go` (sidecar) → `opencode` (exporter), via la même fonction `normalizeProvider` ;
- `subscription` : comparaison insensible à la casse (`Main` et `main` sont le même abonnement).

Les poids restent dans la carte **OpenCode**, avec la fraîcheur du sidecar sur la même carte. Si le sidecar est en échec ou si l'observation est ancienne, les derniers poids connus restent affichés avec un badge **« dernier connu »** explicite. Une clé de poids zéro affiche `0` et un badge « zéro », y compris sur mobile. Les clés sans abonnement correspondant sont repliées dans un petit détail de la carte, sans tableau séparé. L'absence de poids est distinguée d'une collecte en retard : elle n'hérite pas du bandeau « données anciennes ».

### Consommation Bifrost / Hermes

Le portage reprend les règles de `internal/spend/client.go` :

- **Bifrost coût** : une seule reconstruction depuis le compteur cumulatif brut `bifrost_cost_total`, avec baseline avant la période et redémarrages traités. La courbe et les totaux Bifrost (cartes, tableau, fournisseur, modèle) partagent exactement la même source.
- **Bifrost tokens/cache** : `increase()` sur `bifrost_input_tokens_total`, `bifrost_output_tokens_total`, `bifrost_cache_read_input_tokens_total`. Les compteurs redémarrent avec le gateway.
- **Hermes** : valeur courante des jauges `hermes_window_cost_usd`, `hermes_window_tokens`, `hermes_window_sessions` pour `agent="leo"` et `agent="lea"`.
- Toutes les clés Bifrost sont incluses, y compris `hermes-lea` et `hermes-leo`. Les tableaux Hermes restent une vue par personne du même périmètre : ils ne sont jamais ajoutés au tableau Bifrost.
- Les séries Hermes sans fournisseur sont ignorées dès qu'une ventilation par fournisseur existe (ancien exporter).
- Le cache Hermes reste hors de l'entrée ; la vue Bifrost compte le cache lu dans sa colonne dédiée.
- Les sessions de modèle ne sont pas additionnées au total d'une personne (une session peut utiliser plusieurs modèles).
- Les périodes `1m`, `3m`, `6m`, `1y` sont calendaires, depuis le 1er à 00:00 **Europe/Paris**. `all` (« Depuis le début ») cherche au maximum deux ans et affiche depuis la première donnée réellement disponible.
- Les buckets de coût sont en **UTC** et libellés comme tels ; la période sélectionnée reste en Europe/Paris.

Le drill-down personne → fournisseur → modèle est local et accessible au clavier. Le filtre de source pilote à la fois les cartes, les tableaux et la courbe : choisir Léo ou Léa masque Bifrost et l'historique Bifrost. Quatre indicateurs suffisent (coût Bifrost, tokens entrée + sortie, cache, coût Hermes Léo/Léa), les notes techniques sont repliées dans un unique `<details>`.

La courbe de coût Bifrost est reconstruite depuis le **compteur brut cumulatif** `bifrost_cost_total`, dédupliqué et **groupé par clé, fournisseur, modèle et backfill** : chaque série garde son identité, donc l'apparition ou la disparition d'une série ne provoque ni chute ni faux pic. Une requête de référence quotidienne couvre jusqu'à deux ans pour trouver un **baseline avant la période** (dernier échantillon ≤ début). Sans baseline, le premier échantillon est chargé depuis zéro : c'est le premier jour d'activité d'un backfill, ou le coût depuis reset d'un compteur live. Une baisse est un redémarrage (`delta = valeur courante`), puis les deltas sont agrégés par bucket UTC, par clé pour la courbe et par clé/fournisseur/modèle pour les totaux. Les coûts backfill restent datés au jour consommé (échantillons souvent à 23:59 UTC) ; les compteurs live profitent de la granularité fine. Granularité : `1m` = 1 h, `3m` = 6 h, `6m` = 12 h, `1y`/`all` = 1 jour. **La somme des points de la courbe par clé égale son coût Bifrost affiché** (tolérance d'arrondi), quel que soit le bucket ; le tableau accessible peut être downsamplé, mais le total affiché est toujours la somme réelle des séries. La courbe ne complète jamais les jours manquants : les pas absents sont des `null` explicites (`connectNulls: false`). Le zoom est conservé lors d'un rafraîchissement de la même période et réinitialisé quand la fenêtre ou la période change.

## Architecture et sécurité

```
Navigateur ── server functions validées ──► serveur Nitro ── HTTP ──► Prometheus
     ▲                                        │
     └──────── HTML/JSON seulement ───────────┘
```

- Aucune URL Prometheus, aucun token et aucun accès Tailscale dans le bundle navigateur.
- Aucun proxy PromQL : les entrées sont des énumérations (`window`, `range`, `source`) validées. Les requêtes sont des constantes serveur.
- Fichiers `.server.ts` importés uniquement par les server functions et les routes serveur.
- En-têtes de sécurité : CSP `connect-src 'self'`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP. En développement seulement, le websocket Vite est autorisé.
- CSRF middleware TanStack Start sur les server functions.
- Réponses Prometheus limitées à 8 Mio, timeout configurable, erreurs tronquées.

## Healthchecks

| Route          | Comportement                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz` | Liveness du processus Node. Toujours `200` si le serveur répond. Aucune dépendance à Prometheus.                                                                                                                                      |
| `GET /readyz`  | Readiness du processus. **Toujours `200` quand le serveur peut servir l'application**, même si Prometheus est injoignable. Le check Prometheus figure dans `checks.prometheus` à titre informatif, sans retirer le pod des endpoints. |
| `HEAD`         | Mêmes codes, sans corps.                                                                                                                                                                                                              |

Exemple :

```json
{
  "status": "ready",
  "service": "dashboard-infra",
  "checks": {
    "prometheus": {
      "configured": true,
      "ok": false,
      "detail": "Prometheus injoignable : …",
      "latencyMs": 2001
    }
  }
}
```

Le serveur écoute sur `PORT=3000`. Le `HEALTHCHECK` Docker interroge `/healthz`.

## Docker et GitOps

```bash
docker build -t dashboard-infra .
docker run --rm -p 3000:3000 \
  -e PROMETHEUS_URL=http://prometheus-longterm.monitoring.svc.cluster.local:9090 \
  dashboard-infra
```

- Image multi-stage Node 24 LTS, sortie Nitro `.output/`.
- Utilisateur final **numérique `1000:1000`** (`USER 1000:1000`), compatible `runAsNonRoot` Kubernetes.
- `tini` comme PID 1, `SIGTERM`, port `3000`.
- Aucun secret dans l'image. Le dépôt est public et ne contient aucune donnée de production.

Publication GHCR (`.github/workflows/publish.yml`) :

- `linux/amd64` et `linux/arm64` ;
- tags `latest` sur la branche par défaut, `vX.Y.Z` sur les tags ;
- tag **`sha-<7 hex>`**, compatible avec le filtre Image Updater `^sha-[0-9a-f]{7}$` ;
- SBOM et provenance activés.

Les paquets GHCR peuvent rester privés : les manifests `vps-infra` synchronisent un `imagePullSecret` et les credentials de l'Image Updater depuis Infisical. Pour Kubernetes, monter `PROMETHEUS_URL` depuis la configuration du cluster et garder `runAsNonRoot: true`, `runAsUser: 1000`, `runAsGroup: 1000`, `allowPrivilegeEscalation: false`. Les probes peuvent utiliser `/healthz` et `/readyz` : Prometheus ne bloque jamais le démarrage.

## Nix

```bash
nix develop
npm ci
npm run dev:mock
npm run test:e2e
```

Le flake fournit Node 24 LTS, npm, Git et les navigateurs Playwright de la révision `nixpkgs` verrouillée. `@playwright/test` est épinglé à `1.59.1`, la version du driver fourni par le flake ; Chromium est donc reproductible sans téléchargement au moment du test.

Hors Nix, Playwright peut nécessiter les bibliothèques système de Chromium. Sur NixOS, utiliser `nix develop` plutôt que `npx playwright install`.

## Tests et qualité

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run test:e2e
npm run build
```

- Tests unitaires du portage Go : clés Bifrost (Hermes incluses), personnes Léo/Léa, sources, sessions, cache, absence de double comptage, reconstruction exacte (baseline, premier jour backfill, reset, point isolé, granularité fine, all-time), égalité stricte courbe ↔ totaux, erreur globale, fenêtres Paris.
- Tests des transformations d'abonnements : jointure provider normalisée / subscription insensible à la casse, poids zéro, cycles ACU, seuils, collecte partielle, stale.
- Tests du client Prometheus : vecteurs, matrices, valeurs négatives, NaN, JSON invalide, HTTP, timeout et configuration.
- Tests composants : barre de quota accessible, tableaux extensibles, conservation des données lors d'une erreur, thème persistant.
- Playwright + axe : navigation et `aria-current`, filtres en `aria-pressed`, poids OpenCode et zéro, reset ACU, collecte par abonnement, historique et paramètres d'URL, drill-down, thème sombre, états vides, 404, tooltip visible, panneau mobile, zoom conservé, skip-link, échec total de rafraîchissement sans fausse page vide, healthchecks indépendants de Prometheus, WCAG AA desktop et mobile.

## Portée V1

Inclus : historique interactif, quotas, poids dans la carte OpenCode, consommation filtrée, drill-down, états empty/stale/partial, collecte par abonnement. Les indicateurs dupliqués (coût total en en-tête, moyenne de quotas, durée de collecte, panneau de poids séparé) sont volontairement absents.

Hors périmètre : comparaison de périodes, export, vues enregistrées, alerting, écriture Prometheus.

## Licence

MIT — voir `LICENSE`.
