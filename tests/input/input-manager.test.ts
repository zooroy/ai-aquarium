import { describe, expect, it, vi } from 'vitest';
import { InputManager } from '../../src/input/input-manager';
import type { InputProvider, Pointer } from '../../src/input/types';

const pointer: Pointer = { id: 'hand-0', x: 0.5, y: 0.5, fist: false, pressed: false, source: 'hand' };
const provider = (pointers: Pointer[]): InputProvider => ({
  name: 'fake', start() {}, stop() {}, getPointers: () => pointers,
});

describe('InputManager', () => {
  it('returns no pointers without providers', () => {
    expect(new InputManager().getState()).toEqual({ pointers: [] });
  });

  it('accepts a fake provider reporting (0.5, 0.5)', () => {
    const manager = new InputManager();
    manager.register(provider([pointer]));
    expect(manager.getState().pointers).toEqual([pointer]);
  });

  it('merges current pointers from every provider on every call', () => {
    const manager = new InputManager();
    const first = provider([pointer]);
    const secondPointer: Pointer = { ...pointer, id: 'mouse', source: 'mouse' };
    const second = provider([secondPointer]);
    const spy = vi.spyOn(first, 'getPointers');
    manager.register(first);
    manager.register(second);
    expect(manager.getState().pointers).toEqual([pointer, secondPointer]);
    spy.mockReturnValue([]);
    expect(manager.getState().pointers).toEqual([secondPointer]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns independent state snapshots', () => {
    const manager = new InputManager();
    const original = { ...pointer };
    manager.register(provider([original]));
    const previous = manager.getState();
    original.x = 0.1;
    const current = manager.getState();
    expect(current).not.toBe(previous);
    expect(current.pointers).not.toBe(previous.pointers);
    expect(previous.pointers[0].x).toBe(0.5);
    expect(current.pointers[0].x).toBe(0.1);
  });
});
