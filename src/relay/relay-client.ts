export type UploadResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'offline' | 'room-full' | 'invalid' | 'error' };

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface RelayClientOptions {
  /** Supabase project URL, e.g. https://abc.supabase.co */
  url: string;
  /** The project's public anon key; access is limited to the relay_* functions (design.md D2). */
  anonKey: string;
  fetchFn?: FetchFn;
}

const INVALID = new Set(['invalid-room', 'too-large', 'invalid-image']);

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so large PNGs do not overflow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBlob(base64: string, type = 'image/png'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Client for the Supabase relay functions, called through PostgREST's /rest/v1/rpc endpoints. */
export function createRelayClient({ url, anonKey, fetchFn = (input, init) => fetch(input, init) }: RelayClientOptions) {
  const base = url.replace(/\/+$/, '');
  const rpc = (name: string, body: Record<string, unknown>) =>
    fetchFn(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const expectOk = async (name: string, body: Record<string, unknown>): Promise<unknown> => {
    const response = await rpc(name, body);
    if (!response.ok) throw new Error(`${name} failed: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  return {
    async upload(room: string, png: Blob): Promise<UploadResult> {
      let response: Response;
      try {
        response = await rpc('relay_upload', { p_room: room, p_png: await blobToBase64(png) });
      } catch (error) {
        // fetch rejects with TypeError when the network is unreachable.
        return { ok: false, reason: error instanceof TypeError ? 'offline' : 'error' };
      }
      let body: unknown;
      try { body = await response.json(); } catch { return { ok: false, reason: 'error' }; }
      if (response.ok) return typeof body === 'string' ? { ok: true, id: body } : { ok: false, reason: 'error' };
      const message = (body as { message?: unknown } | null)?.message;
      if (message === 'room-full') return { ok: false, reason: 'room-full' };
      if (typeof message === 'string' && INVALID.has(message)) return { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'error' };
    },
    async list(room: string): Promise<string[]> {
      const rows = await expectOk('relay_list', { p_room: room });
      if (!Array.isArray(rows)) throw new Error('relay_list returned no rows');
      return rows.map((row: { fish_id?: unknown }) => row.fish_id).filter((id): id is string => typeof id === 'string');
    },
    async download(room: string, id: string): Promise<Blob> {
      const base64 = await expectOk('relay_get', { p_room: room, p_id: id });
      if (typeof base64 !== 'string') throw new Error('relay_get: fish not found');
      return base64ToBlob(base64);
    },
    async remove(room: string, id: string): Promise<void> {
      await expectOk('relay_delete', { p_room: room, p_id: id });
    },
  };
}

export type RelayClient = ReturnType<typeof createRelayClient>;

/** Builds the client from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY; undefined when either is missing. */
export function createRelayClientFromEnv(env: Record<string, unknown> = import.meta.env): RelayClient | undefined {
  const url = env.VITE_SUPABASE_URL, anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (typeof url !== 'string' || typeof anonKey !== 'string' || !url || !anonKey) return undefined;
  return createRelayClient({ url, anonKey });
}
