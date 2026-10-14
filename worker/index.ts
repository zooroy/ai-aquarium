import { handleRelay } from './relay';
import type { RelayBucket } from './relay';

interface Env { FISH: R2Bucket }

/** Adapts R2 to the relay's minimal bucket interface. */
function r2Bucket(bucket: R2Bucket): RelayBucket {
  return {
    async put(key, body) { await bucket.put(key, body, { httpMetadata: { contentType: 'image/png' } }); },
    async get(key) {
      const object = await bucket.get(key);
      return object ? { body: await object.arrayBuffer() } : null;
    },
    async delete(key) { await bucket.delete(key); },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor });
        keys.push(...page.objects.map((object) => object.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys.sort();
    },
  };
}

// Only /api/* reaches the Worker (wrangler.jsonc run_worker_first); static assets are served directly.
export default {
  fetch(request, env) {
    return handleRelay(request, r2Bucket(env.FISH), Date.now());
  },
} satisfies ExportedHandler<Env>;
