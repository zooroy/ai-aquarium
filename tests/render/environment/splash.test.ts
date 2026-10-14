import { Scene, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { SPLASH_PARAMS as p } from '../../../src/config/params';
import { createRandom } from '../../../src/core/random';
import { advanceSplashBubble, createSplash } from '../../../src/render/environment/splash';

it('rises, slows horizontally, shrinks, and hides after its life', () => {
  const bubble = { position: new Vector3(), velocity: new Vector3(1, p.rise, 0.5), age: 0 };
  const sizes: number[] = [];
  let lastVx = bubble.velocity.x, lastY = 0;
  for (let i = 0; i < Math.ceil(p.life * 60) + 5; i++) {
    sizes.push(advanceSplashBubble(bubble, 1 / 60));
    if (sizes.at(-1)! > 0) {
      expect(bubble.velocity.x).toBeLessThan(lastVx);
      expect(bubble.position.y).toBeGreaterThan(lastY);
    }
    lastVx = bubble.velocity.x; lastY = bubble.position.y;
  }
  expect(sizes[0]).toBeGreaterThan(sizes[10]);
  expect(sizes.at(-1)).toBe(0);
  const frozen = bubble.position.clone();
  expect(advanceSplashBubble(bubble, 1)).toBe(0);
  expect(bubble.position).toEqual(frozen);
});

it('reuses a fixed pool and disposes its resources', () => {
  const scene = new Scene();
  const splash = createSplash(scene, createRandom(1));
  expect(scene.children).toHaveLength(1);
  for (let i = 0; i < 10; i++) splash.burst(new Vector3(i, 0, 0));
  splash.update(0); splash.update(0.1);
  expect(scene.children).toHaveLength(1);
  expect(splash.mesh.count).toBe(p.poolSize);
  const geometry = vi.spyOn(splash.mesh.geometry, 'dispose');
  const material = vi.spyOn(splash.mesh.material as { dispose(): void }, 'dispose');
  splash.dispose();
  expect(scene.children).toHaveLength(0);
  expect(geometry).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
});
