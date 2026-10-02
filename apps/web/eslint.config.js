import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // These screens are retained only as migration references and are not routed.
    // Remove this list as each app-scoped replacement phase deletes its legacy source.
    'src/components/DataTable.tsx',
    'src/components/ProductSelectionScreen.tsx',
    'src/components/modules/**',
    'src/hooks/useSocket.ts',
    'src/pages/AdminDashboard.tsx',
    'src/pages/AdminLogin.tsx',
    'src/pages/affiliates/**',
    'src/pages/customers/**',
    'src/pages/dashboard/**',
    'src/pages/products/**',
    'src/pages/subscriptions/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
