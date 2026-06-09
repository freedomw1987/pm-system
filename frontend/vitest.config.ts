import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Exclude files that use bun:test (they run separately)
    exclude: ['src/utils/authRefresh.test.ts', 'src/hooks/useTaskRecommendation.test.ts'],
  },
})
