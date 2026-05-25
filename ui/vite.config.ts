import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:19407',
      '/ws': { target: 'ws://127.0.0.1:19407', ws: true },
    },
  },
})
