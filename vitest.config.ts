import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    env: {
      // Phase 0 marker: ROUTE_REGISTRY integrity test allows an empty registry while ASSISTANT_PHASE=0.
      // Remove this line when Phase 1 starts populating the registry.
      ASSISTANT_PHASE: '0',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
