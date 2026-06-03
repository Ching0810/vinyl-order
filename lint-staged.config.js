module.exports = {
  // ESLint runs per-workspace via apps/web and apps/api lint-staged configs,
  // where each flat config and local eslint binary live. This root config
  // only applies to files NOT owned by a workspace (root config files and
  // packages/shared, which has no eslint of its own) — prettier formats them.
  '*.{ts,tsx,js,jsx,mjs,json,md,mdx}': 'prettier --write',
};
