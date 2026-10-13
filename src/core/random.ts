export interface Random {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
}

/** Mulberry32；種子截斷並轉為 uint32，每個實例各自持有狀態。 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** 浮點範圍 [min, max)；相同端點回傳該值。 */
    range(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
        throw new RangeError('Expected finite bounds with min <= max');
      }
      return min + (max - min) * next();
    },
    /** 整數範圍 [min, max]，包含兩端。 */
    int(min, max) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) ||
          max < min || !Number.isSafeInteger(max - min + 1)) {
        throw new RangeError('Expected safe integer bounds with min <= max');
      }
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}

/** 不讀取 window；有效數字轉為 uint32，缺少或無效時才使用時間種子。 */
export function resolveSeed(search: string): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw !== null && raw.trim() !== '') {
    const seed = Number(raw);
    if (Number.isFinite(seed)) return seed >>> 0;
  }
  // 唯一非 PRNG 的種子來源：毫秒時鐘與高精度時鐘的微秒部分混合。
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}
