import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Web no tenía ESLint (#484): 21 `eslint-disable react-hooks/exhaustive-deps`
// apuntaban a un gate que no existía. Esta config es deliberadamente estrecha
// — solo las reglas de hooks — para que el gate entre en CI en verde hoy; el
// resto de familias (typescript-eslint, jsx-a11y, react-refresh) se pueden
// añadir después sin tocar el enganche de CI.
export default [
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    linterOptions: {
      // El motivo del issue: sin esto los disables muertos vuelven a acumularse.
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
