import { expect, it } from 'vitest';
import { OneEuroFilter } from '../../../src/input/hand/one-euro';
import { createRandom } from '../../../src/core/random';
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
it('halves stationary jitter standard deviation', () => {
  const random = createRandom(42), filter = new OneEuroFilter();
  const input = Array.from({ length: 300 }, () => .5 + random.range(-.003, .003));
  const output = input.map((x, i) => filter.filter(x, i / 30));
  expect(sd(output.slice(60))).toBeLessThan(sd(input.slice(60)) / 2);
});
it('settles within 0.01 at 133ms after a 300ms linear movement', () => {
  const filter = new OneEuroFilter(); let output = 0;
  for (let i = 0; i <= 43; i++) {
    const time = i / 30;
    output = filter.filter(time < 1 ? .1 : Math.min(.9, .1 + (time - 1) * .8 / .3), time);
  }
  expect(Math.abs(output - .9)).toBeLessThan(.01);
});
it('resets and ignores repeated or backward timestamps', () => {
  const filter = new OneEuroFilter(); expect(filter.filter(.2, 1)).toBe(.2);
  expect(filter.filter(.9, 1)).toBe(.2); expect(filter.filter(.9, 0)).toBe(.2);
  filter.reset(); expect(filter.filter(.9, 0)).toBe(.9);
});
