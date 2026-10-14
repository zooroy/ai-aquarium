import { expect, it } from 'vitest';
import { base64ToBlob, blobToBase64, createRelayClient, createRelayClientFromEnv } from '../../src/relay/relay-client';
import type { FetchFn } from '../../src/relay/relay-client';

const ROOM = 'AAAAAAAAAAAAAAAAAAAAAA';
const URL_ = 'https://abc.supabase.co';
const KEY = 'anon-key';
const respond = (status: number, body?: unknown): FetchFn => async () =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const client = (fetchFn: FetchFn) => createRelayClient({ url: URL_, anonKey: KEY, fetchFn });
const pgError = (message: string) => ({ code: 'P0001', details: null, hint: null, message });

it.each([
  [respond(200, 'uuid-1'), { ok: true, id: 'uuid-1' }],
  [respond(400, pgError('room-full')), { ok: false, reason: 'room-full' }],
  [respond(400, pgError('invalid-image')), { ok: false, reason: 'invalid' }],
  [respond(400, pgError('too-large')), { ok: false, reason: 'invalid' }],
  [respond(400, pgError('invalid-room')), { ok: false, reason: 'invalid' }],
  [respond(500, { message: 'boom' }), { ok: false, reason: 'error' }],
  [respond(200, { nope: 1 }), { ok: false, reason: 'error' }],
  [async () => { throw new TypeError('Failed to fetch'); }, { ok: false, reason: 'offline' }],
] as const)('maps upload responses %#', async (fetchFn, expected) => {
  expect(await client(fetchFn).upload(ROOM, new Blob(['png']))).toEqual(expected);
});

it('calls the RPC endpoints with the anon key and JSON bodies', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const relay = createRelayClient({
    url: `${URL_}/`, anonKey: KEY,
    fetchFn: async (url, init) => {
      calls.push([url, init]);
      if (url.endsWith('relay_list')) return new Response(JSON.stringify([{ fish_id: 'a' }, { fish_id: 'b' }]));
      if (url.endsWith('relay_get')) return new Response(JSON.stringify(btoa('png-bytes')));
      if (url.endsWith('relay_delete')) return new Response(null, { status: 204 });
      return new Response(JSON.stringify('new-id'));
    },
  });
  expect(await relay.upload(ROOM, new Blob(['hi']))).toEqual({ ok: true, id: 'new-id' });
  expect(await relay.list(ROOM)).toEqual(['a', 'b']);
  expect(await (await relay.download(ROOM, 'a')).text()).toBe('png-bytes');
  await relay.remove(ROOM, 'a');
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  expect(calls).toEqual([
    [`${URL_}/rest/v1/rpc/relay_upload`, { method: 'POST', headers, body: JSON.stringify({ p_room: ROOM, p_png: btoa('hi') }) }],
    [`${URL_}/rest/v1/rpc/relay_list`, { method: 'POST', headers, body: JSON.stringify({ p_room: ROOM }) }],
    [`${URL_}/rest/v1/rpc/relay_get`, { method: 'POST', headers, body: JSON.stringify({ p_room: ROOM, p_id: 'a' }) }],
    [`${URL_}/rest/v1/rpc/relay_delete`, { method: 'POST', headers, body: JSON.stringify({ p_room: ROOM, p_id: 'a' }) }],
  ]);
});

it('round-trips binary data through base64, including large blobs', async () => {
  const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
  const back = base64ToBlob(await blobToBase64(new Blob([bytes])));
  expect(back.type).toBe('image/png');
  expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
});

it('throws on errors and on a missing fish', async () => {
  const failing = client(respond(500, { message: 'boom' }));
  await expect(failing.list(ROOM)).rejects.toThrow();
  await expect(failing.download(ROOM, 'a')).rejects.toThrow();
  await expect(failing.remove(ROOM, 'a')).rejects.toThrow();
  await expect(client(respond(200, null)).download(ROOM, 'a')).rejects.toThrow('not found');
});

it('builds from env only when both values exist', () => {
  expect(createRelayClientFromEnv({})).toBeUndefined();
  expect(createRelayClientFromEnv({ VITE_SUPABASE_URL: URL_ })).toBeUndefined();
  expect(createRelayClientFromEnv({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: '' })).toBeUndefined();
  expect(createRelayClientFromEnv({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY })).toBeDefined();
});
