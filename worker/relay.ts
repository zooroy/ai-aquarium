import { CUSTOM_FISH_PARAMS, RELAY_PARAMS as p } from '../src/config/params';

/** The subset of R2 the relay needs; tests inject an in-memory version. */
export interface RelayBucket {
  put(key: string, body: ArrayBuffer): Promise<void>;
  get(key: string): Promise<{ body: ArrayBuffer } | null>;
  delete(key: string): Promise<void>;
  /** Full keys under the prefix, in lexicographic order. */
  list(prefix: string): Promise<string[]>;
}

const ROOM = /^[A-Za-z0-9_-]{22}$/;
const ID = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const NO_STORE = { 'Cache-Control': 'no-store' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, 'Content-Type': 'application/json' } });
const error = (status: number, code: string) => json(status, { error: code });

const prefixOf = (room: string) => `rooms/${room}/`;
const keyOf = (room: string, id: string) => `${prefixOf(room)}${id}.png`;
const idOf = (key: string) => key.slice(key.lastIndexOf('/') + 1, -'.png'.length);
const uploadedAt = (id: string) => Number(id.slice(0, 13));

/** Checks the PNG signature and the IHDR width/height without decoding the image. */
export function isFishPng(bytes: Uint8Array): boolean {
  if (bytes.length < 24 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) return false;
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) === CUSTOM_FISH_PARAMS.textureWidth && view.getUint32(20) === CUSTOM_FISH_PARAMS.textureHeight;
}

/** Live (unexpired) ids in upload order; expired objects are deleted on the way. */
async function pending(bucket: RelayBucket, room: string, now: number): Promise<string[]> {
  const ids: string[] = [];
  for (const key of await bucket.list(prefixOf(room))) {
    const id = idOf(key);
    if (!ID.test(id)) continue;
    if (now - uploadedAt(id) > p.expireMs) await bucket.delete(key);
    else ids.push(id);
  }
  return ids;
}

async function upload(request: Request, bucket: RelayBucket, room: string, now: number): Promise<Response> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > p.maxPngBytes) return error(413, 'too-large');
  const body = await request.arrayBuffer();
  if (body.byteLength > p.maxPngBytes) return error(413, 'too-large');
  if (!isFishPng(new Uint8Array(body))) return error(400, 'invalid-image');
  if ((await pending(bucket, room, now)).length >= p.maxPending) return error(429, 'room-full');
  const id = `${String(Math.floor(now)).padStart(13, '0')}-${crypto.randomUUID()}`;
  await bucket.put(keyOf(room, id), body);
  return json(201, { id });
}

/** Routes /api/rooms/:room/fish[/:id]; everything else under /api is 404 or 405. */
export async function handleRelay(request: Request, bucket: RelayBucket, now: number): Promise<Response> {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'rooms' || parts[3] !== 'fish' || parts.length > 5) return error(404, 'not-found');
  const room = parts[2];
  const id = parts[4];
  const allowed = id === undefined ? ['GET', 'POST'] : ['GET', 'DELETE'];
  if (!allowed.includes(request.method)) {
    return new Response(JSON.stringify({ error: 'method-not-allowed' }), {
      status: 405, headers: { ...NO_STORE, 'Content-Type': 'application/json', Allow: allowed.join(', ') },
    });
  }
  if (!ROOM.test(room)) return error(400, 'invalid-room');
  if (id === undefined) {
    if (request.method === 'POST') return upload(request, bucket, room, now);
    return json(200, { fish: (await pending(bucket, room, now)).map((item) => ({ id: item })) });
  }
  if (!ID.test(id)) return error(request.method === 'DELETE' ? 400 : 404, request.method === 'DELETE' ? 'invalid-id' : 'not-found');
  if (request.method === 'DELETE') {
    await bucket.delete(keyOf(room, id));
    return new Response(null, { status: 204, headers: NO_STORE });
  }
  const object = now - uploadedAt(id) > p.expireMs ? null : await bucket.get(keyOf(room, id));
  if (!object) return error(404, 'not-found');
  return new Response(object.body, { status: 200, headers: { ...NO_STORE, 'Content-Type': 'image/png' } });
}
