import { expect, it, vi } from 'vitest';
import { createRelayClient } from '../../src/relay/relay-client';

const ROOM = 'AAAAAAAAAAAAAAAAAAAAAA';
const respond = (status: number, body?: unknown) => async () =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

it.each([
  [respond(201, { id: 'x' }), { ok: true, id: 'x' }],
  [respond(429, { error: 'room-full' }), { ok: false, reason: 'room-full' }],
  [respond(400, { error: 'invalid-image' }), { ok: false, reason: 'invalid' }],
  [respond(413, { error: 'too-large' }), { ok: false, reason: 'invalid' }],
  [respond(500), { ok: false, reason: 'error' }],
  [respond(201, { nope: 1 }), { ok: false, reason: 'error' }],
  [async () => { throw new TypeError('Failed to fetch'); }, { ok: false, reason: 'offline' }],
])('maps upload responses %#', async (fetchFn, expected) => {
  expect(await createRelayClient(fetchFn).upload(ROOM, new Blob(['png']))).toEqual(expected);
});

it('posts the PNG to the room', async () => {
  const fetchFn = vi.fn(respond(201, { id: 'x' }));
  const png = new Blob(['png'], { type: 'image/png' });
  await createRelayClient(fetchFn, 'https://a.test').upload(ROOM, png);
  expect(fetchFn).toHaveBeenCalledWith(`https://a.test/api/rooms/${ROOM}/fish`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
});

it('lists, downloads and removes with the right URLs and methods', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const client = createRelayClient(async (url, init) => {
    calls.push([url, init]);
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.endsWith('/fish')) return new Response(JSON.stringify({ fish: [{ id: 'a' }, { id: 'b' }] }));
    return new Response('png-bytes');
  });
  expect(await client.list(ROOM)).toEqual(['a', 'b']);
  expect(await (await client.download(ROOM, 'a')).text()).toBe('png-bytes');
  await client.remove(ROOM, 'a');
  expect(calls).toEqual([
    [`/api/rooms/${ROOM}/fish`, undefined],
    [`/api/rooms/${ROOM}/fish/a`, undefined],
    [`/api/rooms/${ROOM}/fish/a`, { method: 'DELETE' }],
  ]);
});

it('throws on non-2xx for list, download and remove', async () => {
  const client = createRelayClient(respond(500));
  await expect(client.list(ROOM)).rejects.toThrow();
  await expect(client.download(ROOM, 'a')).rejects.toThrow();
  await expect(client.remove(ROOM, 'a')).rejects.toThrow();
});
