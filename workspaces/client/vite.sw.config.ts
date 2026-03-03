import path from 'node:path';

import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'events', 'process', 'stream', 'util', 'path'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] || 'production'),
    'process.env.DIRNAME': JSON.stringify('/'),
    global: 'globalThis',
    __dirname: JSON.stringify('/'),
    __filename: JSON.stringify('/serviceworker.global.js'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      input: {
        serviceworker: path.resolve(__dirname, 'src/serviceworker/index.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: 'serviceworker.global.js',
        inlineDynamicImports: true,
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
});
