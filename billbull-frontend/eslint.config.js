import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { checkSpecifier, readSharedExports, zoneOf } from './scripts/workspaceBoundaries.mjs';

// Retail (src/), standalone POS (apps/pos/) and @billbull/shared (packages/shared/) may not import
// each other's files directly. Same checker as scripts/__tests__/workspaceBoundaries.test.js,
// which is the enforced gate; this rule surfaces violations in the editor.
const sharedExports = readSharedExports();
const workspaceBoundaries = {
    rules: {
        'no-cross-boundary-imports': {
            meta: { type: 'problem', schema: [] },
            create(context) {
                const file = context.filename;
                const zone = zoneOf(file);
                if (!zone) return {};
                const report = (node, spec) => {
                    for (const message of checkSpecifier({ file, where: '', zone, spec, exportsMap: sharedExports })) {
                        context.report({ node, message: message.replace(/^: /, '') });
                    }
                };
                const fromSource = (node) => {
                    if (node.source && typeof node.source.value === 'string') report(node.source, node.source.value);
                };
                const isMockCall = (callee) =>
                    callee.type === 'MemberExpression' && callee.object.name === 'vi' &&
                    ['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'].includes(callee.property.name);
                return {
                    ImportDeclaration: fromSource,
                    ExportNamedDeclaration: fromSource,
                    ExportAllDeclaration: fromSource,
                    ImportExpression(node) {
                        if (node.source.type === 'Literal' && typeof node.source.value === 'string') report(node.source, node.source.value);
                    },
                    CallExpression(node) {
                        const [arg] = node.arguments;
                        if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return;
                        if (isMockCall(node.callee) || (node.callee.type === 'Identifier' && node.callee.name === 'require')) {
                            report(arg, arg.value);
                        }
                    },
                };
            },
        },
    },
};

export default [
    { ignores: ['dist', 'build', 'node_modules', '.vite', 'apps/*/dist'] },
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
            'workspace-boundaries': workspaceBoundaries,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            // Project ignores unused vars often (placeholders, future props).
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            'workspace-boundaries/no-cross-boundary-imports': 'error',
        },
    },
];
