module.exports = {
  // ESLint runs per-workspace via apps/web and apps/api lint-staged configs,
  // where each flat config and local eslint binary live. This root config
  // only applies to files NOT owned by a workspace (root config files and
  // packages/shared, which has no eslint of its own) — prettier formats them.
  '*.{ts,tsx,js,jsx,mjs,json,md,mdx}': 'prettier --write',
  // A contract change can break either app, so a shared change typechecks
  // shared and both consumers.
  'packages/shared/src/**/*.ts': () => [
    'pnpm --filter @vinyl-order/shared typecheck',
    'pnpm --filter api typecheck',
    'pnpm --filter web typecheck',
  ],
};
