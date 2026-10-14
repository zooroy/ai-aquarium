import { expect, it } from 'vitest';
import { resolveDeviceMode } from '../../src/core/device-mode';

it.each([
  ['iPhone', { search: '', coarsePointer: true, screenShortSide: 390 }, 'draw'],
  ['iPad', { search: '', coarsePointer: true, screenShortSide: 820 }, 'tank'],
  ['desktop', { search: '', coarsePointer: false, screenShortSide: 1080 }, 'tank'],
  ['small non-touch window', { search: '', coarsePointer: false, screenShortSide: 400 }, 'tank'],
  ['forced draw on desktop', { search: '?mode=draw', coarsePointer: false, screenShortSide: 1080 }, 'draw'],
  ['forced tank on phone', { search: '?mode=tank&room=x', coarsePointer: true, screenShortSide: 390 }, 'tank'],
  ['invalid mode ignored', { search: '?mode=phone', coarsePointer: true, screenShortSide: 390 }, 'draw'],
] as const)('%s', (_name, input, expected) => {
  expect(resolveDeviceMode(input)).toBe(expected);
});
