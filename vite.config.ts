import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        },
      },
  build: {
        outDir: 'dist', // Output to a 'dist' directory in the project root
        sourcemap: false,
        chunkSizeWarningLimit: 1000,
        modulePreload: { polyfill: false },
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('firebase')) return 'firebase';
                if (id.includes('@google/genai')) return 'genai';
                if (id.includes('react')) return 'vendor';
              }
            },
          },
        },
        minify: 'esbuild',
        target: 'es2020',
      },
      esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : undefined,
    };
});
