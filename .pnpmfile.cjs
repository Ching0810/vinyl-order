// Rewrites a package's manifest as pnpm reads it, before resolving.
//
// @prisma/client declares the Prisma CLI and TypeScript as optional peers.
// pnpm links an optional peer whenever the project has it — and ours does, as
// a dev dependency — and records the link in the lockfile, so `pnpm deploy
// --prod` brings both into the API's image after all, with the CLI's own
// dependencies (Prisma Studio, React, an embedded Postgres): some 230MB the
// running API never loads. Its generated clients import only
// @prisma/client/runtime. Dropping the two peers keeps the CLI where it
// belongs, among the dev dependencies (docs/design/deploy.md §8).
//
// Check on a Prisma upgrade: `pnpm --filter api why prisma --prod` should
// find nothing.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === '@prisma/client') {
        for (const peer of ['prisma', 'typescript']) {
          delete pkg.peerDependencies?.[peer];
          delete pkg.peerDependenciesMeta?.[peer];
        }
      }
      return pkg;
    },
  },
};
