module.exports = {
  // Lint + format staged TS/JS files using the api's own flat ESLint config.
  // lint-staged runs this with apps/api as the cwd, so the local eslint
  // binary and eslint.config.mjs resolve correctly.
  '*.{ts,js}': 'eslint --fix',
};
