import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Distinct ports so `npm run dev` doesn't collide with other local servers
  server: { port: 5180 },
  preview: { port: 5181 },
  build: {
    outDir: 'dist',
  },
})
