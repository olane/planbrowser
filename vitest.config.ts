import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'ui/src/**/*.test.ts'],
    environment: 'node'
  }
});
