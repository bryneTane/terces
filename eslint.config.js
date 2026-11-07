import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'public/ort',
      'public/models',
      '.wrangler',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Never use native browser dialogs.
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'Use the Dialog component.' },
        { name: 'confirm', message: 'Use the Dialog component.' },
        { name: 'prompt', message: 'Use the Dialog component.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'alert', message: 'Use the Dialog component.' },
        { object: 'window', property: 'confirm', message: 'Use the Dialog component.' },
        { object: 'window', property: 'prompt', message: 'Use the Dialog component.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
