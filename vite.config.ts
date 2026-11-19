import { msw } from 'msw/vite';
import { defineConfig } from 'vite-plus';
import type { PackUserConfig } from 'vite-plus/pack';
import { playwright } from 'vite-plus/test/browser-playwright';
import pkg from './package.json';

const VERSION = JSON.stringify(pkg.version);
const DEV_DEFINES = { __DEV__: 'true', __VERSION__: VERSION };

// Limits fmt and lint to authored TypeScript: src/, test/, and docs/scopes/
const SOURCE_ONLY = ['/*', '!/src/', '!/test/', '!/e2e/', '!/docs/', '/docs/*', '!/docs/scopes/'];

// One build per entry: a shared chunk would make each plugin import core by URL, and
// a page that reached core through two URLs would run two copies of it
const ENTRIES = [
  ['rouse', 'src/index.ts'],
  ['sync', 'src/plugins/sync/index.ts'],
  ['sse', 'src/plugins/sse/index.ts'],
] as const;

// Plugins import core's types by package name and bundle no dependency: they reach
// core's runtime, alien-signals included, only through `install`
const depsFor = (name: string): PackUserConfig['deps'] =>
  name === 'rouse'
    ? { onlyBundle: ['alien-signals'] }
    : { onlyBundle: [], neverBundle: ['rousejs'] };

const base: PackUserConfig = {
  format: ['esm'],
  platform: 'browser',
  target: 'es2024',
  outDir: 'dist',
  sourcemap: true,
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
      'no-unused-expressions': 'error',
      'typescript/no-base-to-string': 'off',
      'typescript/restrict-template-expressions': 'off',
      'typescript/unbound-method': 'off',
      'typescript/no-redundant-type-constituents': 'off',
    },
    overrides: [
      {
        // core/ is the bottom layer; `app.ts` and `store.ts` compose the rest above it
        files: ['src/core/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: [
                    '../app',
                    '../store',
                    '../dom/*',
                    '../net/*',
                    '../directives',
                    '../directives/*',
                  ],
                  allowTypeImports: true,
                  message: 'core/ must not import the layers above it at runtime.',
                },
              ],
            },
          ],
        },
      },
      {
        // A plugin bundles what it imports, so a stateful module would run twice, and a
        // shared helper would ship twice on a page with both plugins. Only small stateless
        // leaf modules are allowed; everything else reaches the plugin through `install`.
        files: ['src/plugins/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: [
                    '../../**',
                    '!../../core/constants',
                    '!../../core/diagnostics',
                    '!../../core/dispatch',
                    '!../../core/elements',
                    'rousejs',
                    'alien-signals',
                  ],
                  allowTypeImports: true,
                  message:
                    'Plugins import only stateless core helpers at runtime. Reach the rest through PluginApi.',
                },
              ],
            },
          ],
        },
      },
    ],
    ignorePatterns: SOURCE_ONLY,
    options: { typeAware: true, typeCheck: false },
  },
  test: {
    projects: [
      {
        extends: true,
        define: DEV_DEFINES,
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        define: DEV_DEFINES,
        // Serves mockServiceWorker.js so test/browser/setup.ts can start MSW
        plugins: [msw({ mode: 'worker-only' })],
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          setupFiles: ['test/browser/setup.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
  pack: ENTRIES.flatMap(([name, path], i) => [
    {
      ...base,
      entry: { [name]: path },
      deps: depsFor(name),
      define: DEV_DEFINES,
      outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
      dts: true,
      clean: i === 0,
      minify: false,
    },
    {
      ...base,
      entry: { [name]: path },
      deps: depsFor(name),
      define: { __DEV__: 'false', __VERSION__: VERSION },
      outExtensions: () => ({ js: '.min.js' }),
      dts: false,
      clean: false,
      minify: true,
    },
  ]),
});
