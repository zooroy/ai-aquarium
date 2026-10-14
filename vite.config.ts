import { defineConfig } from 'vite';

// The project has no @types/node; only the env lookup is needed here.
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves the site under /ai-aquarium/; the Pages workflow sets VITE_BASE (design.md D7).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
});
