import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __MODEL_CACHE__: JSON.stringify('terces-models-test') },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/functions/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    typecheck: { enabled: true, include: ['tests/unit/**/*.test-d.ts'] },
  },
});
