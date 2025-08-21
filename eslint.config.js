// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  { ignores: ['dist', 'build', 'node_modules'] },

  // Base JS rules
  js.configs.recommended,

  // TS rules (type-aware)
  ...tseslint.configs.recommendedTypeChecked,

  // Project config
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,                 // auto-detect tsconfig.json
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly'
      }
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // React (React 17+ JSX runtime)
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import hygiene
      'import/order': ['warn', {
        'newlines-between': 'always',
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
      }],

      // TS strictness
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',

      // Keep Prettier last to disable conflicting stylistic rules
      'prettier/prettier': 'off'
    }
  }
);
