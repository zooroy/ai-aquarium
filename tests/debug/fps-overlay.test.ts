import { expect, it, vi } from 'vitest';
import { createFpsCounter, createFpsOverlay } from '../../src/debug/fps-overlay';
it('averages actual frame intervals every half second', () => {
  const sample = createFpsCounter();
  expect(sample(0)).toBeUndefined();
  for (let i = 1; i < 30; i++) expect(sample(i * 500 / 30)).toBeUndefined();
  expect(sample(500)).toBeCloseTo(60);
  expect(sample(1000)).toBeCloseTo(2);
});
it('creates no DOM without debug, and updates/disposes the enabled overlay', () => {
  const element = { textContent: '', style: {}, remove: vi.fn() };
  const doc = { createElement: vi.fn(() => element), body: { append: vi.fn() } };
  const disabled = createFpsOverlay('?seed=42', doc as unknown as Document);
  disabled.update(1000); disabled.dispose();
  expect(doc.createElement).not.toHaveBeenCalled();
  const overlay = createFpsOverlay('?debug&seed=42', doc as unknown as Document);
  expect(doc.body.append).toHaveBeenCalledWith(element);
  overlay.update(0); overlay.update(500);
  expect(element.textContent).toBe('FPS: 2.0');
  overlay.dispose(); expect(element.remove).toHaveBeenCalledOnce();
});
