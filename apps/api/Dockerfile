# The API's image (docs/design/deploy.md §8). Built from the repository root,
# so the workspace — lockfile, shared, mockpay — is in reach:
#
#   docker build -f apps/api/Dockerfile -t vinyl-api .
#
# Two stages: `build` installs and compiles with every tool it needs, and
# `runtime` keeps only what running the API takes.

# The version in .nvmrc. Debian (glibc) rather than Alpine (musl), as the safe
# default: today's one native module, bcrypt, ships binaries for both, but not
# every package does, and musl's differences (DNS lookups among them) surface
# as bugs seen only on Alpine. The two base images differ by a few tens of MB.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim

FROM ${NODE_IMAGE} AS build
# The version in package.json's packageManager field.
RUN npm install --global pnpm@12.6.0
WORKDIR /repo

# Manifests first, sources after: until a manifest or the lockfile changes,
# Docker reuses the installed layer and only the compile below runs again.
# .pnpmfile.cjs changes what pnpm resolves, so it counts as one of them.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY apps/api/package.json apps/api/
COPY apps/mockpay/package.json apps/mockpay/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# Only the API and what it depends on — not the web. Scripts wait: the Prisma
# clients they generate need the schemas, which come with the sources.
RUN pnpm install --frozen-lockfile --filter "api..." --ignore-scripts

COPY apps/api apps/api
COPY apps/mockpay apps/mockpay
COPY packages/shared packages/shared
RUN pnpm --filter api --filter @vinyl-order/mockpay run postinstall \
 && pnpm --filter "api..." build

# The API with its production dependencies alone, workspace packages copied in
# as their dist. --ignore-scripts: the Prisma clients are already compiled into
# each dist, and generating them again would need the CLI, a dev dependency.
RUN pnpm --filter api deploy --prod --ignore-scripts /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Owned by root, as COPY leaves them: the app's user can read them, not change
# them.
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# Local uploads (STORAGE_DRIVER=local) are written here until object storage
# replaces them (deploy.md §6.6), so the app's user must own it.
RUN mkdir uploads && chown node:node uploads

# Not root: a flaw in the app then can't change the image's own files.
USER node
EXPOSE 3001
# node itself, not a package manager in between, so the platform's stop signal
# reaches the process that handles it.
CMD ["node", "dist/main.js"]
