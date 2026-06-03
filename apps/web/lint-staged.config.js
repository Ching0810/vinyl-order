module.exports = {
  // Lint + format staged TS/JS files using web's own flat ESLint config.
  // lint-staged runs this with apps/web as the cwd, so the local eslint
  // binary and eslint.config.mjs resolve correctly.
  '*.{ts,tsx,js,jsx,mjs}': 'eslint --fix',
};
