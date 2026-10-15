import viteBasepath from 'vite-basepath';
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [viteBasepath(), react()],
  base: './'
})
