import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Minimal vitest config: enable the same `@/` alias Next uses, run
// jsdom for the pieces that touch the DOM (none of the current tests
// do, but cheap insurance), and limit to actual *.test.ts files inside
// src/.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
