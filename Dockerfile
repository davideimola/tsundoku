# The container the cluster runs (ADR-0003, ADR-0004).
#
# Three things it has to be, and each one is a decision rather than boilerplate:
#
#   1. **It must build with no database.** `pnpm build` already works with `DATABASE_URL`
#      unset, because every page that reads the library is `force-dynamic` and reads it per
#      request — so nothing here passes a connection string as a build argument, and
#      nothing should. A build that needed a database would need one in CI, in a registry
#      job and on a laptop, and the first thing anybody would reach for is a copy of the
#      owner's own.
#   2. **It must not run as root.** The image ships with `USER node`, and
#      `apps/tsundoku/deployment.yaml` in the cluster repo says so again as a
#      `securityContext`. Twice on purpose: the image is what makes it true anywhere it is
#      run, and the manifest is what refuses to schedule it if it ever stops being true.
#   3. **It must carry the migrations.** The deployment runs them from this same image
#      before the app is allowed to serve, so what is applied is exactly what was built.
#      `db/` is therefore copied into the runtime stage on purpose, next to the traced
#      server rather than into it.
#
# `output: "standalone"` in `next.config.ts` is the other half of this file: it traces what
# the server actually imports and writes a self-contained server, so the last stage is node
# plus that directory instead of node plus every dependency in the lockfile.

# The version mise pins for development, so what is built here is what was tested there.
FROM node:22-alpine AS base
# Corepack reads `packageManager` from package.json, so the pnpm version is the lockfile's
# and not whatever the image happens to ship.
RUN corepack enable
WORKDIR /build


# ── Dependencies ──────────────────────────────────────────────────────────────
# Its own stage so that the layer survives every change that is not a lockfile change,
# which is nearly all of them.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /build/node_modules ./node_modules
COPY . .
# No `DATABASE_URL`, no `AUTH_*` and no `MCP_BEARER_TOKEN`. See decision 1 above.
#
# `NEXT_TELEMETRY_DISABLED` because a build phoning home is a build that can fail for a
# reason that has nothing to do with the code.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build


# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The traced server, its dependencies and the trimmed manifest, all of which `standalone`
# writes. `.next/static` and `public/` are the two things it deliberately does not trace —
# they are served, not imported — and this app has no `public/`, so there is one to copy.
COPY --from=build --chown=node:node /build/.next/standalone ./
COPY --from=build --chown=node:node /build/.next/static ./.next/static

# The schema, and the runner that applies it. Plain `.ts` run through node's own type
# stripping, which is how `pnpm db:migrate` runs it on a laptop too — one runner, one
# convention, and no build step of its own to drift.
COPY --from=build --chown=node:node /build/db ./db

# Next writes here when it caches a fetch, and a `node` that cannot create it fails at the
# first request rather than at start.
RUN mkdir -p .next/cache && chown -R node:node .next

# Decision 2. `node` is uid 1000 in this base image, which matters: Kubernetes'
# `runAsNonRoot` cannot tell whether a *name* is root, so the deployment states the number
# as well (`runAsUser: 1000`) and the two have to agree.
USER node

EXPOSE 3000

# `server.js`, not `next start`: standalone's whole point is that the CLI is not shipped.
CMD ["node", "server.js"]
