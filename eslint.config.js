import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  { files: ['js/**/*.js'], languageOptions: { globals: globals.browser } },
  // Tests run in Node but pass callbacks into the page, so both sets apply.
  { files: ['tests/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['eslint.config.js'], languageOptions: { globals: globals.node } }
];
