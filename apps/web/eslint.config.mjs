// ESLint Flat Config for the Next.js (TypeScript) web app.

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintPluginPromise from 'eslint-plugin-promise';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Ignore patterns for third-party and generated outputs
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'components/ui/**', // Skip generated Chakra UI components (if any)
    ],
  },

  // Base presets
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals,

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      // Pin the TS project root so typescript-eslint doesn't have to guess
      // between apps/api and apps/web when ESLint sees the whole monorepo.
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },

    // Note: the `import` plugin is already registered by eslint-config-next,
    // so we only register prettier + promise here (re-registering throws).
    plugins: {
      prettier: eslintPluginPrettier,
      promise: eslintPluginPromise,
    },

    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },

    rules: {
      // Close React Compiler rules
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',

      // Prettier baseline and const preference
      'prettier/prettier': 'warn',
      'prefer-const': 'error',

      // Import organization and ordering
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
      'import/no-unresolved': 'off', // TypeScript resolves modules; avoids dup errors
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],

      // Control-flow braces
      curly: ['error', 'multi-line'],

      // Arrow function style
      'arrow-parens': ['error', 'always'],
      'arrow-body-style': ['error', 'as-needed', { requireReturnForObjectLiteral: true }],

      // Strings and semicolons
      quotes: ['error', 'single', { avoidEscape: true }],
      'jsx-quotes': ['error', 'prefer-double'],
      semi: ['error', 'always'],

      // Strict no-console policy: use project logger instead
      'no-console': ['error'],

      // Early-return preference
      'no-else-return': ['error', { allowElseIf: false }],

      // JSX structure and formatting consistency
      'react/jsx-wrap-multilines': [
        'error',
        {
          declaration: 'parens-new-line',
          assignment: 'parens-new-line',
          return: 'parens-new-line',
          arrow: 'parens-new-line',
        },
      ],
      'react/jsx-first-prop-new-line': ['error', 'multiline'],
      'react/jsx-max-props-per-line': ['error', { maximum: 1, when: 'multiline' }],
      'react/jsx-closing-bracket-location': ['error', 'line-aligned'],
      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'ignore',
          propElementValues: 'always',
        },
      ],
      'react/jsx-boolean-value': ['error', 'never'],

      // Chakra UI usage guardrails: avoid polymorphic Box and disallow sx
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="Box"] JSXAttribute[name.name="as"]',
          message:
            'Avoid <Box as="...">. Use the corresponding Chakra component (e.g., <Text>, <Button>).',
        },
        {
          selector: 'JSXAttribute[name.name="sx"]',
          message: 'Use the "css" prop instead of "sx".',
        },
      ],

      // Promise hygiene
      'promise/always-return': 'error',
      'promise/catch-or-return': ['error', { allowFinally: true }],
      'promise/no-nesting': 'warn',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/no-new-statics': 'error',
      'promise/valid-params': 'error',

      // React safety
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['coerce', 'ternary'] }],

      // General security and readability
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-throw-literal': 'error',
      'no-useless-concat': 'error',
      'prefer-template': 'error',
      'no-alert': 'warn',

      // Complexity guardrails
      complexity: ['warn', { max: 12 }],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 3],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],

      // Function style unification
      'prefer-arrow-callback': ['error', { allowNamedFunctions: false, allowUnboundThis: false }],
      'func-style': ['error', 'expression', { allowArrowFunctions: true }],

      // Default export compatibility with HOC wrappers
      'import/no-anonymous-default-export': [
        'error',
        {
          allowAnonymousFunction: false,
          allowArrowFunction: false,
          allowAnonymousClass: false,
          allowObject: false,
          allowCallExpression: true,
          allowArray: false,
          allowLiteral: false,
        },
      ],
      'react/display-name': 'off',
      'no-invalid-this': 'error',
    },
  },

  // Component-specific rules for UI folders
  {
    files: ['**/components/**/*.{js,jsx,ts,tsx}', '**/app/_components/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'import/prefer-default-export': 'error',
      'react/function-component-definition': [
        'error',
        {
          namedComponents: ['arrow-function', 'function-declaration'],
          unnamedComponents: 'arrow-function',
        },
      ],
    },
  },

  // Console usage exceptions: allow console only in dedicated logging utilities
  {
    files: ['**/logger.{js,ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
]);
