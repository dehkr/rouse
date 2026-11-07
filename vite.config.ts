import { defineConfig } from 'vite-plus';
import type { PackUserConfig } from 'vite-plus/pack';
import pkg from './package.json';

const VERSION = JSON.stringify(pkg.version);

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
  fmt: {},
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
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
