# syntax=docker/dockerfile:1.7
# =============================================================================
#  PST Portal — multi-stage image
#
#  Targets
#    app    Next.js standalone server (public site, backoffice, REST API)
#    tools  Full source + dependencies: background worker, Prisma migrations,
#           seed, legacy importer, maintenance scripts
#
#  docker build --target app   -t pst-app .
#  docker build --target tools -t pst-tools .
# =============================================================================

ARG NODE_IMAGE=node:24-bookworm-slim

# ----------------------------------------------------------------- base
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false
WORKDIR /app

# ----------------------------------------------------------------- deps
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# ----------------------------------------------------------------- build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No secrets or database are needed at build time: env is validated lazily
# at runtime and public pages render on first request.
# Small VPS (≈2 GB RAM): skip Next's type-check step (types are checked before
# commit with `npm run typecheck`) and allow a larger heap, backed by swap.
ENV SKIP_BUILD_TYPECHECK=1 \
    NODE_OPTIONS=--max-old-space-size=1536
RUN npx prisma generate && npx next build

# ----------------------------------------------------------------- runtime base
FROM ${NODE_IMAGE} AS runtime
# DejaVu fonts: KTA card text is rasterised by librsvg (sharp) inside the container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 pst \
 && useradd --system --uid 1001 --gid pst --home-dir /app --shell /usr/sbin/nologin pst \
 && mkdir -p /app/.cache/fontconfig && chown -R pst:pst /app/.cache
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Dili
WORKDIR /app

# ----------------------------------------------------------------- app
FROM runtime AS app
ENV PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=pst:pst /app/.next/standalone ./
COPY --from=build --chown=pst:pst /app/.next/static ./.next/static
COPY --from=build --chown=pst:pst /app/public ./public
RUN mkdir -p /app/storage && chown pst:pst /app/storage
USER pst
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

# ----------------------------------------------------------------- tools
FROM runtime AS tools
COPY --from=deps --chown=pst:pst /app/node_modules ./node_modules
COPY --chown=pst:pst package.json package-lock.json tsconfig.json prisma.config.ts ./
COPY --chown=pst:pst prisma ./prisma
COPY --chown=pst:pst src ./src
COPY --chown=pst:pst scripts ./scripts
COPY --chown=pst:pst messages ./messages
COPY --chown=pst:pst public ./public
RUN npx prisma generate && mkdir -p /app/storage && chown pst:pst /app/storage /app/src/generated -R
USER pst
ENTRYPOINT ["/usr/bin/tini", "--"]
# Default: background worker. Override for one-off jobs, e.g.
#   docker compose run --rm migrate npx prisma migrate deploy
CMD ["node", "--import", "tsx", "src/worker/index.ts"]
