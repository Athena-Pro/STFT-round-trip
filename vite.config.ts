import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  base: process.env.VITE_BASE || '/REPO_NAME/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
