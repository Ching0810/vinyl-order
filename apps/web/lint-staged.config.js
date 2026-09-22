module.exports = {
  // Lint + format staged TS/JS files using web's own flat ESLint config.
  // lint-staged runs this with apps/web as the cwd, so the local eslint
  // binary and eslint.config.mjs resolve correctly.
  //
  // Then typecheck the whole project, not just the staged files: a change in
  // one file can break the types of another. A function, so lint-staged does
  // not append the staged file names — tsc ignores tsconfig.json when given
  // files.
  '*.{ts,tsx,js,jsx,mjs}': ['eslint --fix', () => 'tsc --noEmit'],
};
