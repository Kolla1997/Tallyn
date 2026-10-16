import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Lint for the web app (#100): the recommended JavaScript rules plus React's
// hook rules. Formatting is Prettier's job (.prettierrc), not ESLint's.
export default [
  { ignores: ['dist/**', 'e2e-dist/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // JSX components count as used.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      // Setting a loading flag when a fetch starts is fine here: a warning
      // to keep an eye on, not a failure.
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'vite.config.js', 'eslint.config.js', 'playwright.config.js', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
]
