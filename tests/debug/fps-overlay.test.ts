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
  expect(element.textContent).toBe('FPS: 2.0｜抓住：0｜逃走：0｜手:無');
  overlay.dispose(); expect(element.remove).toHaveBeenCalledOnce();
});

it('shows detection fields only while an active camera reports stats', () => {
  for (const search of ['?debug', '?debug&camera']) {
    const element = { textContent: '', style: {}, remove: vi.fn() };
    const doc = { createElement: () => element, body: { append() {} } };
    const overlay = createFpsOverlay(search, doc as unknown as Document);
    overlay.setDetection({ hz: 25, averageMs: 8, delegate: 'CPU', detected: true });
    {
      expect(element.textContent).toContain('25.0 Hz');
      expect(element.textContent).toContain('8.0 ms');
      expect(element.textContent).toContain('CPU');
      expect(element.textContent).toContain('偵測: 有');
    }
    overlay.setDetection(undefined);
    expect(element.textContent).not.toContain('detect');
    overlay.dispose();
  }
});

it('shows grabbed/fleeing counts and hand press states in debug mode', async () => {
  const { createSchool } = await import('../../src/simulation/fish-state');
  const { createRandom } = await import('../../src/core/random');
  const fish = createSchool(3, { min: {x:-1,y:-1,z:-1}, max: {x:1,y:1,z:1} }, createRandom(42));
  fish[0].mode='grabbed'; fish[1].mode='fleeing';
  const element={textContent:'',style:{},remove:vi.fn()};
  const overlay=createFpsOverlay('?debug',{createElement:()=>element,body:{append(){}}} as unknown as Document);
  for (const pressed of [false,true]) for(const side of ['left','right'] as const) {
    overlay.setInteraction(fish,{pointers:[{id:'hand-0',source:'hand',x:.5,y:.5,pressed}]},side);
    expect(element.textContent).toContain('抓住：1｜逃走：1');
    expect(element.textContent).toContain((pressed?'手:捏住':'手:張開')+(side==='right'?'(右)':'(左)'));
  }
  overlay.setInteraction(fish,{pointers:[]}); expect(element.textContent).toContain('手:無'); overlay.dispose();
});
