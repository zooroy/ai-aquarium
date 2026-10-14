import { expect, it, vi } from 'vitest';
import { createRisingEdge, receiveAction } from '../../src/ui/custom-fish-feature';
import { phonePairUrl } from '../../src/relay/room-code';

it('decides what to do with a relayed fish', () => {
  expect(receiveAction(true, true)).toBe('duplicate');
  expect(receiveAction(true, false)).toBe('duplicate');
  expect(receiveAction(false, false)).toBe('full');
  expect(receiveAction(false, true)).toBe('place');
});

it('shows the waiting notice only when waiting starts', () => {
  const show = vi.fn();
  const update = createRisingEdge(show);
  for (const value of [false, true, true, true, false, true]) update(value);
  expect(show).toHaveBeenCalledTimes(2);
});

it('builds the QR URL for the drawing page', () => {
  expect(phonePairUrl('https://a.workers.dev', 'AAAAAAAAAAAAAAAAAAAAAA')).toBe('https://a.workers.dev/?mode=draw&room=AAAAAAAAAAAAAAAAAAAAAA');
});
