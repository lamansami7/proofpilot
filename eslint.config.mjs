import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';

export default ts.config(
  { ignores: ['node_modules/**', 'dist/**', '.cache/**', 'coverage/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'], languageOptions: { globals: globals.jest } },
  { files: ['supabase/functions/**/*.ts'], languageOptions: { globals: { Deno: 'readonly' } } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } },
);
