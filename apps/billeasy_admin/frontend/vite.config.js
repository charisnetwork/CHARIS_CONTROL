import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3021,
    host: true
  },
  envPrefix: ['VITE_', 'ADMIN_BACKEND_KEY', 'ADMIN_PASS_KEY']
});
