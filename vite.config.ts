import { defineConfig } from 'vite-plus';
import type { PackUserConfig } from 'vite-plus/pack';
import pkg from './package.json';

const VERSION = JSON.stringify(pkg.version);

// Limits fmt and lint to authored TypeScript: src/, test/, and docs/scopes/
const SOURCE_ONLY = ['/*', '!/src/', '!/test/', '!/docs/', '/docs/*', '!/docs/scopes/'];

const base: PackUserConfig = {
  entry: { rouse: 'src/index.ts' },
  format: ['esm'],
  platform: 'browser',
  target: 'es2024',
  outDir: 'dist',
  sourcemap: true,
  deps: { onlyBundle: ['alien-signals'] },
  outputOptions: { comments: { legal: true, annotation: true, jsdoc: false } },
};

export default defineConfig({
  fmt: {
    singleQuote: true,
    printWidth: 90,
    ignorePatterns: SOURCE_ONLY,
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    categories: { correctness: 'error' },
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'typescript/no-base-to-string': 'off',
      'typescript/restrict-template-expressions': 'off',
      'typescript/unbound-method': 'off',
      'typescript/no-redundant-type-constituents': 'off',
    },
    ignorePatterns: SOURCE_ONLY,
    options: { typeAware: true, typeCheck: false },
  },
  test: {
    projects: [
      {
        extends: true,
        define: { __DEV__: 'true', __VERSION__: VERSION },
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
  pack: [
    {
      ...base,
      define: { __DEV__: 'true', __VERSION__: VERSION },
      outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
      dts: true,
      clean: true,
      minify: false,
    },
    {
      ...base,
      define: { __DEV__: 'false', __VERSION__: VERSION },
      outExtensions: () => ({ js: '.min.js' }),
      dts: false,
      clean: false,
      minify: true,
    },
  ],
});
