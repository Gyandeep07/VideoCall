import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: 'window',
    'process.env': {},   // prevent "process is not defined"
  },
  resolve: {
    alias: {
      util: 'util/',   // 👈 forces Vite to use the npm util polyfill
    },
  },
})
