import { expect, it } from 'vitest';
import { PHONE_MESSAGES, failureMessage } from '../../src/phone/phone-page';

it('explains each upload failure separately', () => {
  expect(failureMessage('offline')).toBe(PHONE_MESSAGES.offline);
  expect(failureMessage('room-full')).toBe(PHONE_MESSAGES.roomFull);
  expect(failureMessage('invalid')).toBe(PHONE_MESSAGES.failed);
  expect(failureMessage('error')).toBe(PHONE_MESSAGES.failed);
});
