import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'styles',
    emptyOutDir: false,
    assetsDir: '',
    rollupOptions: {
      input: {
        tailwind: 'styles/tailwind.src.css',
      },
      output: {
        assetFileNames: '[name][extname]',
      },
    },
  },
});
