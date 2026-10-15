import { describe, expect, it, vi } from 'vitest';
import { PointerProvider } from '../../src/input/pointer-provider';

// 僅模擬 provider 使用的 target/事件介面，無 DOM 或 jsdom。
class FakeTarget {
  style = { touchAction: 'pan-y', cursor: 'crosshair' };
  rect = { left: 0, top: 0, width: 1000, height: 500 };
  listeners = new Map<string, Set<(event: PointerEvent) => void>>();
  addEventListener(type: string, listener: (event: PointerEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: PointerEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  getBoundingClientRect() { return this.rect; }
  emit(type: string, overrides: Partial<PointerEvent> = {}): void {
    const event = { type, pointerType: 'mouse', pointerId: 1, clientX: 250, clientY: 125, buttons: 0, ...overrides };
    for (const listener of this.listeners.get(type) ?? []) listener(event as PointerEvent);
  }
  asElement(): HTMLElement { return this as unknown as HTMLElement; }
}

function setup() {
  const target = new FakeTarget();
  const provider = new PointerProvider();
  provider.start(target.asElement());
  return { target, provider };
}

describe('PointerProvider', () => {
  it('starts empty and disables native cursor and touch gestures', () => {
    const { target, provider } = setup();
    expect(provider.name).toBe('pointer');
    expect(provider.getPointers()).toEqual([]);
    expect(target.style).toEqual({ touchAction: 'none', cursor: 'none' });
    expect(target.listeners.size).toBe(6);
  });

  it('normalizes (250,125) in a 1000x500 target', () => {
    const { target, provider } = setup();
    target.emit('pointermove');
    expect(provider.getPointers()).toEqual([{ id: 'mouse', x: 0.25, y: 0.25, fist: false, pressed: false, source: 'mouse' }]);
  });

  it('uses target offsets, current dimensions and clamps coordinates', () => {
    const { target, provider } = setup();
    target.rect = { left: 100, top: 50, width: 400, height: 200 };
    target.emit('pointermove', { clientX: 200, clientY: 100 });
    expect(provider.getPointers()[0]).toMatchObject({ x: 0.25, y: 0.25 });
    target.emit('pointermove', { clientX: -10, clientY: 999 });
    expect(provider.getPointers()[0]).toMatchObject({ x: 0, y: 1 });
  });

  it('prioritizes right button over left and removes the mouse on leave', () => {
    const { target, provider } = setup();
    target.emit('pointerdown', { buttons: 2 });
    expect(provider.getPointers()[0].pressed).toBe(false);
    target.emit('pointermove', { buttons: 3 });
    expect(provider.getPointers()[0]).toMatchObject({pressed:false,fist:true});
    target.emit('pointermove', { buttons: 1 });
    expect(provider.getPointers()[0].pressed).toBe(true);
    target.emit('pointerup', { buttons: 0 });
    expect(provider.getPointers()[0].pressed).toBe(false);
    target.emit('pointerleave');
    expect(provider.getPointers()).toEqual([]);
  });

  it.each(['pointerup', 'pointercancel'])('removes only the ended touch on %s', (end) => {
    const { target, provider } = setup();
    target.emit('pointerdown', { pointerType: 'touch', pointerId: 3 });
    target.emit('pointerdown', { pointerType: 'touch', pointerId: 7 });
    expect(provider.getPointers()).toEqual([
      { id: 'touch-3', x: 0.25, y: 0.25, fist: false, pressed: true, source: 'touch' },
      { id: 'touch-7', x: 0.25, y: 0.25, fist: false, pressed: true, source: 'touch' },
    ]);
    target.emit('pointermove', { pointerType: 'touch', pointerId: 7, clientX: 500 });
    target.emit('pointerleave', { pointerType: 'touch', pointerId: 7 });
    expect(provider.getPointers()).toHaveLength(2);
    target.emit(end, { pointerType: 'touch', pointerId: 3 });
    expect(provider.getPointers()).toEqual([
      { id: 'touch-7', x: 0.5, y: 0.25, fist: false, pressed: true, source: 'touch' },
    ]);
    target.emit(end, { pointerType: 'touch', pointerId: 7 });
    expect(provider.getPointers()).toEqual([]);
  });

  it('treats pen as mouse with a distinct id', () => {
    const { target, provider } = setup();
    target.emit('pointermove');
    target.emit('pointerdown', { pointerType: 'pen', buttons: 1 });
    expect(provider.getPointers()[1]).toMatchObject({ id: 'pen', source: 'mouse', fist: false, pressed: true });
    target.emit('pointerup', { pointerType: 'pen' });
    expect(provider.getPointers()[1].pressed).toBe(false);
    target.emit('pointerleave', { pointerType: 'pen' });
    expect(provider.getPointers().map((p) => p.id)).toEqual(['mouse']);
  });

  it('removes cancelled mouse input and ignores zero-size targets', () => {
    const { target, provider } = setup();
    target.emit('pointerdown', { buttons: 1 });
    target.emit('pointercancel');
    expect(provider.getPointers()).toEqual([]);
    target.rect.width = 0;
    target.emit('pointermove');
    expect(provider.getPointers()).toEqual([]);
  });

  it('returns snapshots that cannot mutate internal pointers', () => {
    const { target, provider } = setup();
    target.emit('pointermove');
    const snapshot = provider.getPointers();
    snapshot[0].x = 1;
    snapshot.pop();
    expect(provider.getPointers()[0].x).toBe(0.25);
  });

  it('stop removes all listeners, clears state and prevents further updates', () => {
    const { target, provider } = setup();
    target.emit('pointermove');
    provider.stop();
    expect([...target.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(target.style).toEqual({ touchAction: 'pan-y', cursor: 'crosshair' });
    for (const type of target.listeners.keys()) target.emit(type);
    expect(provider.getPointers()).toEqual([]);
    provider.stop();
  });

  it('restarting detaches the previous target and avoids duplicate listeners', () => {
    const { target, provider } = setup();
    provider.start(target.asElement());
    expect([...target.listeners.values()].every((listeners) => listeners.size === 1)).toBe(true);
    const next = new FakeTarget();
    provider.start(next.asElement());
    target.emit('pointermove');
    expect(provider.getPointers()).toEqual([]);
    next.emit('pointermove');
    expect(provider.getPointers()).toHaveLength(1);
    expect(target.style.cursor).toBe('crosshair');
  });
});

it('suppresses contextmenu only while started and applies right-button rules to pen',()=>{
  const {target,provider}=setup(),preventDefault=vi.fn();
  target.emit('contextmenu',{preventDefault});expect(preventDefault).toHaveBeenCalledOnce();
  for(const pointerType of ['mouse','pen']) for(const buttons of [0,1,2,3]) {
    target.emit('pointermove',{pointerType,buttons});
    const pointer=provider.getPointers().find(p=>p.id===(pointerType==='pen'?'pen':'mouse'))!;
    expect(pointer.fist).toBe((buttons&2)!==0);
    expect(pointer.pressed).toBe(buttons===1);
  }
  target.emit('pointerdown',{pointerType:'touch',pointerId:5,buttons:3});
  expect(provider.getPointers().find(p=>p.id==='touch-5')).toMatchObject({pressed:true,fist:false});
  provider.stop();target.emit('contextmenu',{preventDefault});expect(preventDefault).toHaveBeenCalledOnce();
});
