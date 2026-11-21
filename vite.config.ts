import { defineConfig } from 'vitest/config';

// `base: './'` makes every asset URL relative, so the same build works at
// https://<user>.github.io/<repo>/ and from `npm run preview` without
// hard-coding the repository name.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
