import { defineConfig } from 'tsup';

const baseConfig = {
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  noExternal: ['alien-signals'],
  splitting: false,
  sourcemap: true,
};

export default defineConfig([
  {
    ...baseConfig,
    outExtension() {
      return { js: '.js' };
    },
    dts: true,
    clean: true,
    minify: false,
  },
  {
    ...baseConfig,
    outExtension() {
      return { js: '.min.js' };
    },
    dts: false,
    clean: false,
    minify: true,
  },
]);
