import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'cloudflare-login-route',
    closeBundle() {
      mkdirSync(resolve(import.meta.dirname, 'dist/login'), { recursive: true });
      copyFileSync(resolve(import.meta.dirname, 'dist/login.html'), resolve(import.meta.dirname, 'dist/login/index.html'));
    },
  }],
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        login: resolve(import.meta.dirname, 'login.html'),
      },
    },
  },
});
