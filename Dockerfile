# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS runtime

ARG APP_VERSION=dev

LABEL org.opencontainers.image.title="dashboard-infra" \
      org.opencontainers.image.description="Abonnements IA et consommation Bifrost/Hermes, alimentés par Prometheus" \
      org.opencontainers.image.source="https://github.com/BaptTF/dashboard-infra" \
      org.opencontainers.image.url="https://github.com/BaptTF/dashboard-infra" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    TMPDIR=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app \
    && chown 1000:1000 /app

WORKDIR /app
COPY --from=build --chown=1000:1000 /app/.output ./.output

# Numeric UID/GID keeps Kubernetes runAsNonRoot happy even without a name lookup.
USER 1000:1000

EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
