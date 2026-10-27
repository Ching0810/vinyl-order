module.exports = {
  // As in apps/api: lint + format staged files with this package's own ESLint
  // config, then typecheck the whole package. MockPay's sources are also read
  // by the API, so a change here typechecks the API too.
  '*.{ts,js}': ['eslint --fix', () => 'tsc --noEmit', () => 'pnpm --filter api typecheck'],
};
