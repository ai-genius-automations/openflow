import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 42013,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:42012',
        ws: true,
      },
    },
  },
});
