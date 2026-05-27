import globals from 'globals';
import js from '@eslint/js';
import eslintPluginVue from 'eslint-plugin-vue';
import ts from 'typescript-eslint';

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommended,
    ...eslintPluginVue.configs['flat/recommended'],
    {
        ignores: ['stubs/**', 'node_modules/**'],
    },
    {
        languageOptions: {
            sourceType: 'module',
            parserOptions: {
                parser: '@typescript-eslint/parser',
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/ban-ts-comment': 'warn',
            'vue/component-api-style': ['error', ['script-setup']],
            'vue/block-lang': ['error', { script: { lang: 'ts' } }],
            'vue/html-indent': ['error', 4],
            'vue/html-quotes': ['error', 'single', { avoidEscape: true }],
            'vue/multi-word-component-names': 0,
            'vue/no-multiple-template-root': 0,
            'vue/no-v-model-argument': 0,
            'vue/require-v-for-key': 0,
        },
    },
);
