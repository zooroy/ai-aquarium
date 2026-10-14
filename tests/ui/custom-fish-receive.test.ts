import { expect, it } from 'vitest';
import { CUSTOM_FISH_MESSAGES, arrivalMessage } from '../../src/ui/custom-fish-feature';
import { phonePairUrl } from '../../src/relay/room-code';

it('announces arrivals and replacements', () => {
  expect(arrivalMessage('local', false)).toBeUndefined();
  expect(arrivalMessage('local', true)).toBe(CUSTOM_FISH_MESSAGES.replaced);
  expect(arrivalMessage('phone', false)).toBe(CUSTOM_FISH_MESSAGES.received);
  expect(arrivalMessage('phone', true)).toBe(CUSTOM_FISH_MESSAGES.receivedReplaced);
});

it('builds the QR URL for the drawing page', () => {
  expect(phonePairUrl('https://zooroy.github.io/ai-aquarium/', 'AAAAAAAAAAAAAAAAAAAAAA')).toBe('https://zooroy.github.io/ai-aquarium/?mode=draw&room=AAAAAAAAAAAAAAAAAAAAAA');
  expect(phonePairUrl('http://localhost:5180', 'AAAAAAAAAAAAAAAAAAAAAA')).toBe('http://localhost:5180/?mode=draw&room=AAAAAAAAAAAAAAAAAAAAAA');
});
