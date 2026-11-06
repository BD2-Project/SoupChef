import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Build de la app de escritorio (Tauri): SPA clásica contra src/index.html.
// Se mantiene separado del build SvelteKit porque Tauri sirve archivos estáticos.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [svelte({ preprocess: vitePreprocess() }), tailwindcss()],
  build: {
    outDir: 'dist',
  },
  // Tauri necesita ver los errores de Rust y un puerto fijo para devUrl
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
