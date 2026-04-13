import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  splitting: false,
  sourcemap: false,
  minify: false,
  onSuccess: 'chmod +x dist/cli.js',
});
