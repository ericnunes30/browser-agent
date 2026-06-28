import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['extension/src/**/*.{test,spec}.{js,ts}'],
  },
});
