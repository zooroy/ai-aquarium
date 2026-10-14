import { afterEach, expect, it, vi } from 'vitest';
import { createRoomCode, isRoomCode, loadRoomCode } from '../../src/relay/room-code';
import type { CodeStorage } from '../../src/relay/room-code';

const bytes = (fill: number) => () => new Uint8Array(16).fill(fill);
const memory = (initial?: string): CodeStorage & { value?: string } => {
  const store: CodeStorage & { value?: string } = {
    value: initial,
    getItem: () => store.value ?? null,
    setItem: (_key, value) => { store.value = value; },
  };
  return store;
};
afterEach(() => vi.restoreAllMocks());

it('encodes 16 bytes as 22 base64url characters', () => {
  expect(createRoomCode(new Uint8Array(16).fill(0xff))).toBe('_____________________w');
  expect(createRoomCode(new Uint8Array(16).fill(0xfb))).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(createRoomCode(new Uint8Array(16).fill(0xfb))).toContain('-');
});

it('validates room codes', () => {
  expect(isRoomCode('AAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
  for (const bad of ['', 'AAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAA=', 'AAAAAAAAAAAAAAAAAAAA/+', null, 42]) {
    expect(isRoomCode(bad)).toBe(false);
  }
});

it('reuses a saved code and replaces a missing or invalid one', () => {
  const saved = memory('BBBBBBBBBBBBBBBBBBBBBB');
  expect(loadRoomCode(saved, bytes(1))).toBe('BBBBBBBBBBBBBBBBBBBBBB');
  for (const storage of [memory(), memory('broken')]) {
    const code = loadRoomCode(storage, bytes(0));
    expect(code).toBe('AAAAAAAAAAAAAAAAAAAAAA');
    expect(storage.value).toBe(code);
  }
});

it('returns a valid session code when storage throws or is missing', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const throwing: CodeStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  expect(isRoomCode(loadRoomCode(throwing, bytes(7)))).toBe(true);
  expect(isRoomCode(loadRoomCode(undefined, bytes(7)))).toBe(true);
  expect(isRoomCode(loadRoomCode(undefined))).toBe(true);
});
