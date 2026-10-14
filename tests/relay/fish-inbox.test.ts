import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFishInbox } from '../../src/relay/fish-inbox';
import type { FishInboxOptions, ReceiveResult } from '../../src/relay/fish-inbox';

const ROOM = 'AAAAAAAAAAAAAAAAAAAAAA';
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function setup(ids: string[], results: Record<string, ReceiveResult> = {}, overrides: Partial<FishInboxOptions> = {}) {
  const client = {
    list: vi.fn(async () => [...ids]),
    download: vi.fn(async (_room: string, id: string) => new Blob([id])),
    remove: vi.fn(async (_room: string, id: string) => { ids.splice(ids.indexOf(id), 1); }),
  };
  const receive = vi.fn(async (id: string) => results[id] ?? 'placed');
  const onWaiting = vi.fn();
  const inbox = createFishInbox({ client, room: ROOM, receive, onWaiting, isVisible: () => true, intervalMs: 1000, ...overrides });
  return { client, receive, onWaiting, inbox };
}

it('removes placed and invalid fish from the relay', async () => {
  const { client, receive, onWaiting, inbox } = setup(['a', 'b'], { b: 'invalid' });
  inbox.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(receive.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
  expect(client.remove.mock.calls.map(([, id]) => id)).toEqual(['a', 'b']);
  expect(onWaiting).toHaveBeenLastCalledWith(false);
  inbox.stop();
});

it('stops the round on full, keeps the fish, and clears waiting once there is room', async () => {
  const results: Record<string, ReceiveResult> = { a: 'full' };
  const { client, receive, onWaiting, inbox } = setup(['a', 'b'], results);
  inbox.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).toHaveBeenCalledTimes(1);
  expect(client.remove).not.toHaveBeenCalled();
  expect(onWaiting).toHaveBeenLastCalledWith(true);
  results.a = 'placed';
  await vi.advanceTimersByTimeAsync(1000);
  expect(client.remove.mock.calls.map(([, id]) => id)).toEqual(['a', 'b']);
  expect(onWaiting).toHaveBeenLastCalledWith(false);
  inbox.stop();
});

it('keeps polling after list or download errors', async () => {
  const { client, receive, inbox } = setup(['a', 'b']);
  client.list.mockRejectedValueOnce(new Error('offline'));
  client.download.mockRejectedValueOnce(new Error('broken'));
  inbox.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(receive.mock.calls.map(([id]) => id)).toEqual(['b']);
  await vi.advanceTimersByTimeAsync(1000);
  expect(receive.mock.calls.map(([id]) => id)).toEqual(['b', 'a']);
  inbox.stop();
});

it('never overlaps rounds', async () => {
  let release!: () => void;
  const { client, inbox } = setup([]);
  client.list.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([]); }));
  inbox.start();
  await vi.advanceTimersByTimeAsync(5000);
  inbox.poke();
  expect(client.list).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(client.list).toHaveBeenCalledTimes(2);
  inbox.stop();
});

it('skips rounds while hidden and checks immediately on poke', async () => {
  let visible = false;
  const { client, inbox } = setup([], {}, { isVisible: () => visible });
  inbox.start();
  await vi.advanceTimersByTimeAsync(3000);
  expect(client.list).not.toHaveBeenCalled();
  visible = true;
  inbox.poke();
  await vi.advanceTimersByTimeAsync(0);
  expect(client.list).toHaveBeenCalledTimes(1);
  inbox.stop();
});

it('does not poll after stop', async () => {
  const { client, inbox } = setup([]);
  inbox.start();
  await vi.advanceTimersByTimeAsync(0);
  inbox.stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(client.list).toHaveBeenCalledTimes(1);
});
