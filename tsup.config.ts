import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    outExtension({ format }) {
      return {
        js: format === 'esm' ? '.mjs' : '.cjs',
      };
    },
    noExternal: ['alien-signals'],
    dts: true,
    clean: true,
    minify: false,
    splitting: false,
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtension({ format }) {
      return {
        js: '.min.mjs',
      };
    },
    noExternal: ['alien-signals'],
    dts: true,
    clean: true,
    minify: true,
    splitting: false,
  },
  {
    entry: {
      rouse: 'src/index.ts',
    },
    format: ['iife'],
    outExtension() {
      return {
        js: '.js',
      };
    },
    clean: true,
    minify: false,
    splitting: false,
  },
  {
    entry: {
      rouse: 'src/index.ts',
    },
    format: ['iife'],
    outExtension() {
      return {
        js: '.min.js',
      };
    },
    clean: true,
    minify: true,
    splitting: false,
  },
]);
