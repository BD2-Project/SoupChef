import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Build web con SSR: el servidor Node abre el TCP contra el motor.
// SvelteKit 3 toma su configuración desde este plugin (ya no existe
// svelte.config.js).
export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      // El proyecto ya usaba `public/` (Vite); SvelteKit por defecto busca `static/`.
      files: { assets: 'public' },
      adapter: adapter({ out: 'build' }),
    }),
  ],
  server: {
    port: 5173,
  },
})
