import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/REPO_NAME/', // GH Pages will override
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
