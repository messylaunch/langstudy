import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Flat config. The frontend is plain JSX (no TypeScript) — this catches the
// real bugs a type checker would otherwise: undefined refs, unused vars,
// bad hook usage. Kept low-noise on purpose.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/sw.js'] },

  // Browser app source
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Vite/automatic JSX runtime
      'react/prop-types': 'off', // no PropTypes in this codebase by choice
      // Off on purpose: this is a text-heavy language app; apostrophes/quotes
      // in natural-language copy ("you're", "class") render fine. Escaping
      // hundreds of them is churn, not a bug fix. Keep the rules that catch
      // real defects (no-undef, no-unused-vars, rules-of-hooks) on.
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Node scripts, hooks, config
  {
    files: ['scripts/**/*.mjs', '.claude/hooks/**/*.mjs', 'vite.config.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },

  // Vitest unit tests
  {
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },
]
