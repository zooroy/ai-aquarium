import { afterEach, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { AquariumRenderer, supportsWebGL } from '../../src/render/renderer';

const mocks = vi.hoisted(() => ({ size: vi.fn(), ratio: vi.fn(), dispose: vi.fn() }));
vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: class {
    setSize = mocks.size;
    setPixelRatio = mocks.ratio;
    dispose = mocks.dispose;
    render() {}
  } };
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('handles unsupported or throwing WebGL contexts without throwing', () => {
  expect(supportsWebGL({ getContext: () => null } as unknown as HTMLCanvasElement)).toBe(false);
  expect(supportsWebGL({ getContext: () => { throw new Error('disabled'); } } as unknown as HTMLCanvasElement)).toBe(false);
});
it('updates aspect and bounds on resize, caps pixel ratio and projects with y downward', () => {
  const events = new Map<string, () => void>();
  vi.stubGlobal('window', {
    devicePixelRatio: 3,
    addEventListener: (type: string, callback: () => void) => events.set(type, callback),
    removeEventListener: (type: string) => events.delete(type),
  });
  let rect = { width: 1280, height: 800 };
  const renderer = new AquariumRenderer({ getBoundingClientRect: () => rect } as unknown as HTMLCanvasElement);
  expect(mocks.ratio).toHaveBeenLastCalledWith(2);
  expect(mocks.size).toHaveBeenLastCalledWith(1280, 800, false);
  const landscape = renderer.getBounds();
  expect(renderer.projectToScreen(new Vector3())).toEqual({ x: 0.5, y: 0.5 });
  expect(renderer.projectToScreen(new Vector3(1, 1, 0)).y).toBeLessThan(0.5);
  rect = { width: 800, height: 1000 };
  events.get('resize')!();
  expect(renderer.camera.aspect).toBe(0.8);
  expect(renderer.getBounds().max.x).toBeLessThan(landscape.max.x);
  expect(renderer.getBounds().max.y).toBe(landscape.max.y);
  expect(mocks.size).toHaveBeenLastCalledWith(800, 1000, false);
  renderer.dispose();
  expect(events.size).toBe(0);
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
