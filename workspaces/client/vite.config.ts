import fs from 'node:fs';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vite';

const WORKSPACE_DIR = path.resolve(__dirname, '../..');
const SEED_IMAGE_DIR = path.resolve(WORKSPACE_DIR, './workspaces/server/seeds/images');
const IMAGE_PATH_LIST = fs.readdirSync(SEED_IMAGE_DIR).map((file) => `/images/${file}`);

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'events', 'process', 'stream', 'util', 'path'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  define: {
    'process.env.API_URL': JSON.stringify(''),
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] || 'production'),
    'process.env.PATH_LIST': JSON.stringify(IMAGE_PATH_LIST.join(',')),
    global: 'globalThis',
  },
  build: {
    outDir: 'dist',
    manifest: true,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      input: {
        client: path.resolve(__dirname, 'src/index.tsx'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/swr')) {
            return 'vendor-react';
          }
          if (id.includes('@wsh-2024/admin') || id.includes('node_modules/@mui') || id.includes('node_modules/@chakra-ui') || id.includes('node_modules/@emotion')) {
            return 'vendor-admin';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      'path-browserify': path.resolve(__dirname, 'src/utils/pathShim.ts'),
    },
  },
});
