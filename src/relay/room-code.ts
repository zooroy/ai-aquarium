import { RELAY_PARAMS as p } from '../config/params';

const STORAGE_KEY = 'ai-aquarium.roomCode';
const PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface CodeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** base64url without padding: 16 bytes become 22 characters. */
export function createRoomCode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && PATTERN.test(value);
}

/**
 * The room code must be unpredictable and independent of `?seed=`, so it uses
 * crypto.getRandomValues instead of the seeded PRNG (src/core/random.ts) on purpose.
 */
export function cryptoRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Reuses this device's saved code; creates and saves a new one otherwise. Storage failures yield a session-only code. */
export function loadRoomCode(storage: CodeStorage | undefined, randomBytes: (length: number) => Uint8Array = cryptoRandomBytes): string {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (isRoomCode(saved)) return saved;
  } catch (error) {
    console.warn('無法讀取魚缸代碼', error);
  }
  const code = createRoomCode(randomBytes(p.roomCodeBytes));
  try { storage?.setItem(STORAGE_KEY, code); } catch (error) { console.warn('無法保存魚缸代碼', error); }
  return code;
}
