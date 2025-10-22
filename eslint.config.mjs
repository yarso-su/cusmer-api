// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      'no-unused-expressions': ['error', { allowTaggedTemplates: true }],
      '@typescript-eslint/no-unsafe-call': 'warn'
    }
  }
)
