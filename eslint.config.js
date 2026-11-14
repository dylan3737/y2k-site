import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'desktop/node_modules/', 'desktop/dist/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  { files: ['js/**/*.js', 'desktop/renderer/**/*.js'], languageOptions: { globals: globals.browser } },
  // Tests run in Node but pass callbacks into the page, so both sets apply.
  { files: ['tests/**/*.mjs', 'desktop/tests/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['eslint.config.js', 'desktop/main.js', 'desktop/oracle.js'], languageOptions: { globals: globals.node } },
  { files: ['desktop/preload.cjs'], languageOptions: { sourceType: 'commonjs', globals: globals.node } }
];
