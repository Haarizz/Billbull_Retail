import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    { ignores: ['dist', 'build', 'node_modules', '.vite'] },
    {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            // Project ignores unused vars often (placeholders, future props).
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
];
