import vue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'scripts/**'] },
  ...vue.configs['flat/recommended'],
  skipFormatting,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      // Single-word view/component names are intentional here (Login, Systems…).
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': ['warn', { args: 'none' }]
    }
  }
]
