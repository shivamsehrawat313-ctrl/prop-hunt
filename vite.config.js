import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } } },
  optimizeDeps: { noDiscovery: true, include: [] },
  build: { outDir: '../dist/client', emptyOutDir: true },
});
