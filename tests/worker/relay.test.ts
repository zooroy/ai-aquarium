import { describe, expect, it } from 'vitest';
import { handleRelay, isFishPng } from '../../worker/relay';
import type { RelayBucket } from '../../worker/relay';

const ROOM_A = 'AAAAAAAAAAAAAAAAAAAAAA';
const ROOM_B = 'BBBBBBBBBBBBBBBBBBBBBB';
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_760_000_000_000;

class MemoryBucket implements RelayBucket {
  readonly objects = new Map<string, ArrayBuffer>();
  async put(key: string, body: ArrayBuffer) { this.objects.set(key, body); }
  async get(key: string) { const body = this.objects.get(key); return body ? { body } : null; }
  async delete(key: string) { this.objects.delete(key); }
  async list(prefix: string) { return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort(); }
}

function png(width = 512, height = 256, size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

const url = (path: string) => `https://aquarium.test${path}`;
const send = (bucket: RelayBucket, method: string, path: string, now = T0, body?: Uint8Array) =>
  handleRelay(new Request(url(path), { method, body: body ? new Blob([body.slice()]) : undefined }), bucket, now);
const upload = (bucket: RelayBucket, room = ROOM_A, now = T0, body = png()) => send(bucket, 'POST', `/api/rooms/${room}/fish`, now, body);
const list = async (bucket: RelayBucket, room = ROOM_A, now = T0) =>
  ((await (await send(bucket, 'GET', `/api/rooms/${room}/fish`, now)).json()) as { fish: { id: string }[] }).fish.map((item) => item.id);

describe('handleRelay', () => {
  it('accepts a 512×256 PNG and lists it only in its own room', async () => {
    const bucket = new MemoryBucket();
    const response = await upload(bucket);
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(await list(bucket)).toEqual([id]);
    expect(await list(bucket, ROOM_B)).toEqual([]);
    const other = await send(bucket, 'GET', `/api/rooms/${ROOM_B}/fish/${id}`);
    expect(other.status).toBe(404);
  });

  it.each(['short', 'has space!!!!!!!!!!!!!', 'AAAAAAAAAAAAAAAAAAAAAAA'])('rejects malformed room %j without touching storage', async (room) => {
    const bucket = new MemoryBucket();
    for (const response of [await upload(bucket, encodeURIComponent(room)), await send(bucket, 'GET', `/api/rooms/${encodeURIComponent(room)}/fish`)]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-room' });
    }
    expect(bucket.objects.size).toBe(0);
  });

  it('rejects a JPEG, wrong dimensions and oversize files without storing anything', async () => {
    const bucket = new MemoryBucket();
    const jpeg = new Uint8Array(64); jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect((await upload(bucket, ROOM_A, T0, jpeg)).status).toBe(400);
    expect((await upload(bucket, ROOM_A, T0, png(1024, 1024))).status).toBe(400);
    const big = await upload(bucket, ROOM_A, T0, png(512, 256, 2 * 1024 * 1024));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'too-large' });
    expect(bucket.objects.size).toBe(0);
  });

  it('refuses the 21st pending fish with room-full', async () => {
    const bucket = new MemoryBucket();
    for (let i = 0; i < 20; i++) expect((await upload(bucket, ROOM_A, T0 + i)).status).toBe(201);
    const response = await upload(bucket, ROOM_A, T0 + 20);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'room-full' });
    expect(await list(bucket, ROOM_A, T0 + 20)).toHaveLength(20);
  });

  it('lists oldest first, downloads, and deletes idempotently', async () => {
    const bucket = new MemoryBucket();
    const ids: string[] = [];
    for (const at of [T0 + 2000, T0, T0 + 1000]) ids.push(((await (await upload(bucket, ROOM_A, at)).json()) as { id: string }).id);
    expect(await list(bucket, ROOM_A, T0 + 3000)).toEqual([ids[1], ids[2], ids[0]]);
    const download = await send(bucket, 'GET', `/api/rooms/${ROOM_A}/fish/${ids[0]}`, T0 + 3000);
    expect(download.status).toBe(200);
    expect(download.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(png());
    expect((await send(bucket, 'DELETE', `/api/rooms/${ROOM_A}/fish/${ids[0]}`, T0 + 3000)).status).toBe(204);
    expect(await list(bucket, ROOM_A, T0 + 3000)).toEqual([ids[1], ids[2]]);
    expect((await send(bucket, 'DELETE', `/api/rooms/${ROOM_A}/fish/${ids[0]}`, T0 + 3000)).status).toBe(204);
    expect((await send(bucket, 'GET', `/api/rooms/${ROOM_A}/fish/${ids[0]}`, T0 + 3000)).status).toBe(404);
  });

  it('expires fish older than a day, deletes them, and does not count them toward the limit', async () => {
    const bucket = new MemoryBucket();
    for (let i = 0; i < 20; i++) await upload(bucket, ROOM_A, T0 + i);
    const later = T0 + DAY + 100;
    expect(await list(bucket, ROOM_A, later)).toEqual([]);
    expect(bucket.objects.size).toBe(0);
    for (let i = 0; i < 20; i++) await upload(bucket, ROOM_A, T0 + i);
    expect((await upload(bucket, ROOM_A, later)).status).toBe(201);
  });

  it('returns 404 for unknown paths, 405 for wrong methods, and no-store everywhere', async () => {
    const bucket = new MemoryBucket();
    const id = ((await (await upload(bucket)).json()) as { id: string }).id;
    const cases: [string, string, number][] = [
      ['GET', '/api/unknown', 404],
      ['GET', `/api/rooms/${ROOM_A}/fish/${id}/extra`, 404],
      ['PUT', `/api/rooms/${ROOM_A}/fish`, 405],
      ['POST', `/api/rooms/${ROOM_A}/fish/${id}`, 405],
      ['GET', `/api/rooms/${ROOM_A}/fish/not-an-id`, 404],
      ['DELETE', `/api/rooms/${ROOM_A}/fish/not-an-id`, 400],
      ['GET', `/api/rooms/${ROOM_A}/fish`, 200],
    ];
    for (const [method, path, status] of cases) {
      const response = await send(bucket, method, path);
      expect(response.status, `${method} ${path}`).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});

describe('isFishPng', () => {
  it('checks signature, IHDR and size', () => {
    expect(isFishPng(png())).toBe(true);
    expect(isFishPng(png(256, 512))).toBe(false);
    expect(isFishPng(png().subarray(0, 20))).toBe(false);
  });
});
