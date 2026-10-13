import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRandom, resolveSeed } from '../../src/core/random';

afterEach(() => vi.restoreAllMocks());

describe('createRandom', () => {
  it('reproduces the same sequence with independent state', () => {
    const first = createRandom(42);
    const expected = Array.from({ length: 100 }, () => first.next());
    const second = createRandom(42);
    expect(Array.from({ length: 100 }, () => second.next())).toEqual(expected);
    expect(createRandom(43).next()).not.toBe(expected[0]);
  });

  it('matches a known mulberry32 sequence', () => {
    const random = createRandom(1);
    expect([random.next(), random.next(), random.next()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });

  it.each([0, 42, 0xffffffff, -1])('keeps seed %s output in [0, 1)', (seed) => {
    const random = createRandom(seed);
    for (let i = 0; i < 10000; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('supports float ranges and inclusive integer ranges', () => {
    const random = createRandom(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const value = random.range(-2, 3);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(3);
      const integer = random.int(-2, 2);
      expect(Number.isInteger(integer)).toBe(true);
      expect(integer).toBeGreaterThanOrEqual(-2);
      expect(integer).toBeLessThanOrEqual(2);
      seen.add(integer);
    }
    expect(seen).toEqual(new Set([-2, -1, 0, 1, 2]));
    expect(random.range(2, 2)).toBe(2);
    expect(random.int(2, 2)).toBe(2);
    expect(() => random.range(3, 2)).toThrow(RangeError);
    expect(() => random.int(0.5, 2)).toThrow(RangeError);
  });
});

describe('resolveSeed', () => {
  it.each([
    ['?seed=42', 42], ['?debug&seed=0', 0], ['seed=123&debug', 123],
    ['?seed=-1', 0xffffffff], ['?seed=4294967296', 0], ['?seed=3.9', 3],
  ])('parses %s without reading clocks', (search, expected) => {
    const clock = vi.spyOn(Date, 'now');
    const preciseClock = vi.spyOn(performance, 'now');
    expect(resolveSeed(search)).toBe(expected);
    expect(clock).not.toHaveBeenCalled();
    expect(preciseClock).not.toHaveBeenCalled();
  });

  it.each(['', '?debug', '?seed=', '?seed=%20', '?seed=nope', '?seed=NaN', '?seed=Infinity', '?seed=42fish'])(
    'uses time for missing or invalid seed: %s', (search) => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
      vi.spyOn(performance, 'now').mockReturnValue(123.456);
      const random = vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random must not be used');
      });
      expect(resolveSeed(search)).toBe((1700000000000 ^ 123456) >>> 0);
      expect(random).not.toHaveBeenCalled();
    },
  );
});
