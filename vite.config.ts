import { defineConfig } from 'vite';

// /api 轉給 `npm run dev:worker`（wrangler dev 預設埠 8787），見 design.md D7。
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
