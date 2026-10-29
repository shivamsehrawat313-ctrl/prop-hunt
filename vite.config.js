import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { outDir: '../dist/client', emptyOutDir: true },
});
