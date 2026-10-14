import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { RELAY_PARAMS } from '../../src/config/params';

const ROOT = new URL('../../supabase/migrations/', import.meta.url);
const migration = new TextDecoder().decode(readFileSync(new URL('0001_fish_relay.sql', ROOT).pathname));
const ROOM_A = 'AAAAAAAAAAAAAAAAAAAAAA';
const ROOM_B = 'BBBBBBBBBBBBBBBBBBBBBB';

function png(width = 512, height = 256, size = 64): string {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  // Supabase provides these roles; the migration grants to them.
  await db.exec('create role anon nologin; create role authenticated nologin;');
  await db.exec(migration);
});

/** Calls a function the way PostgREST does for the browser: as the anon role. */
async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    return (await tx.query<T>(sql, params)).rows;
  });
}
const upload = async (room: string, data = png()) =>
  (await asAnon<{ id: string }>('select public.relay_upload($1, $2) as id', [room, data]))[0].id;
const list = async (room = ROOM_A) =>
  (await asAnon<{ fish_id: string }>('select fish_id from public.relay_list($1)', [room])).map((row) => row.fish_id);
const get = async (room: string, id: string) =>
  (await asAnon<{ png: string | null }>('select public.relay_get($1, $2) as png', [room, id]))[0].png;
const remove = (room: string, id: string) => asAnon('select public.relay_delete($1, $2)', [room, id]);
const count = async () => (await db.query<{ n: number }>('select count(*)::int as n from public.relay_fish')).rows[0].n;

describe('fish relay SQL', () => {
  it('stores a valid PNG and only shows it in its own room', async () => {
    const id = await upload(ROOM_A);
    expect(await list(ROOM_A)).toEqual([id]);
    expect(await list(ROOM_B)).toEqual([]);
    expect(await get(ROOM_B, id)).toBeNull();
    expect(await get(ROOM_A, id)).toBe(png());
  });

  it.each(['short', 'has space!!!!!!!!!!!!!', 'AAAAAAAAAAAAAAAAAAAAAAA', ''])('rejects malformed room %j everywhere', async (room) => {
    await expect(upload(room)).rejects.toThrow('invalid-room');
    await expect(list(room)).rejects.toThrow('invalid-room');
    await expect(get(room, crypto.randomUUID())).rejects.toThrow('invalid-room');
    await expect(remove(room, crypto.randomUUID())).rejects.toThrow('invalid-room');
    expect(await count()).toBe(0);
  });

  it('rejects JPEG, wrong size, oversize and malformed base64 without storing', async () => {
    const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)));
    await expect(upload(ROOM_A, jpeg)).rejects.toThrow('invalid-image');
    await expect(upload(ROOM_A, png(1024, 1024))).rejects.toThrow('invalid-image');
    await expect(upload(ROOM_A, png(512, 256, 2 * 1024 * 1024))).rejects.toThrow('too-large');
    await expect(upload(ROOM_A, png(512, 256, RELAY_PARAMS.maxPngBytes + 1))).rejects.toThrow('too-large');
    await expect(upload(ROOM_A, 'not base64 at all!')).rejects.toThrow('invalid-image');
    expect(await count()).toBe(0);
    await upload(ROOM_A, png(512, 256, RELAY_PARAMS.maxPngBytes));
    expect(await count()).toBe(1);
  });

  it('refuses the 21st pending fish with room-full', async () => {
    for (let i = 0; i < RELAY_PARAMS.maxPending; i++) await upload(ROOM_A);
    await expect(upload(ROOM_A)).rejects.toThrow('room-full');
    expect(await list()).toHaveLength(RELAY_PARAMS.maxPending);
    await upload(ROOM_B);
  });

  it('lists oldest first and deletes idempotently', async () => {
    const ids = [await upload(ROOM_A), await upload(ROOM_A), await upload(ROOM_A)];
    expect(await list()).toEqual(ids);
    await remove(ROOM_A, ids[1]);
    expect(await list()).toEqual([ids[0], ids[2]]);
    await remove(ROOM_A, ids[1]);
    await remove(ROOM_B, ids[0]);
    expect(await list()).toEqual([ids[0], ids[2]]);
    expect(await get(ROOM_A, ids[1])).toBeNull();
  });

  it('expires fish older than a day and frees their slots', async () => {
    for (let i = 0; i < RELAY_PARAMS.maxPending; i++) await upload(ROOM_A);
    const hours = RELAY_PARAMS.expireMs / 3_600_000 + 1;
    await db.query(`update public.relay_fish set created_at = now() - make_interval(hours => $1)`, [hours]);
    const old = (await db.query<{ id: string }>('select id from public.relay_fish limit 1')).rows[0].id;
    expect(await get(ROOM_A, old)).toBeNull();
    await upload(ROOM_A);
    expect(await list()).toHaveLength(1);
    expect(await count()).toBe(1);
  });

  it('denies anon direct table access', async () => {
    await upload(ROOM_A);
    await expect(asAnon('select * from public.relay_fish')).rejects.toThrow(/permission denied/);
    await expect(asAnon(`insert into public.relay_fish (room, png) values ($1, '\\x00')`, [ROOM_A])).rejects.toThrow(/permission denied/);
    await expect(asAnon('select public.relay_check_room($1)', [ROOM_A])).rejects.toThrow(/permission denied/);
  });

  it('uses the same limits as RELAY_PARAMS', () => {
    expect(migration).toContain(`>= ${RELAY_PARAMS.maxPending} then`);
    expect(migration).toContain(`> ${RELAY_PARAMS.maxPngBytes} then`);
    expect(migration).toContain(`interval '${RELAY_PARAMS.expireMs / 86_400_000} day'`);
    expect(migration).toContain(`length(p_png) > ${Math.ceil(RELAY_PARAMS.maxPngBytes / 3) * 4}`);
  });
});
