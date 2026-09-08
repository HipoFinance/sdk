import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

// Flat config, matching sdk-example and the webapps. Type-aware, because the whole job of this
// package is parsing on-chain data into typed shapes -- rules that cannot see types would miss
// exactly the mistakes that matter here.
export default tseslint.config(
    { ignores: ['dist'] },
    {
        files: ['src/**/*.ts'],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.strictTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
            // Last, so it wins: turns off every rule Prettier already decides.
            prettier,
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: globals.node,
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
)
