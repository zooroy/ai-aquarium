import { Scene } from 'three';
import { expect, it } from 'vitest';
import { createRandom } from '../../../src/core/random';
import { computeTankBounds } from '../../../src/core/tank-bounds';
import { createRocks } from '../../../src/render/environment/rocks';
import { createCoral } from '../../../src/render/environment/coral';
import { createSeaweed } from '../../../src/render/environment/seaweed';
import { advanceBubble, createBubbles } from '../../../src/render/environment/bubbles';

it('respawns bubbles at the ground after crossing the surface', () => {
  expect(advanceBubble(1, 1, 0.5, -4, 2)).toBe(1.5);
  expect(advanceBubble(1.9, 1, 0.5, -4, 2)).toBe(-4);
  expect(advanceBubble(-6, 0, 0.5, -4, 2)).toBe(-4);
});
it.each([createRocks, createCoral, createSeaweed])('places seeded decorations on ground in front/back and away from center', (create) => {
  let bounds = computeTankBounds({ fovDeg: 45, cameraZ: 14, aspect: 16 / 9 });
  const scene = new Scene();
  const ctx = { random: createRandom(42), getBounds: () => bounds, getHeight: (x: number, z: number) => -4 + x * 0.01 + z * 0.01 };
  const module = create(scene, ctx);
  expect(scene.children.some((child) => child.position.z > 0)).toBe(true);
  expect(scene.children.some((child) => child.position.z < -4)).toBe(true);
  const other = new Scene();
  const copy = create(other, { ...ctx, random: createRandom(42) });
  expect(other.children.map((child) => child.position)).toEqual(scene.children.map((child) => child.position));
  for (const aspect of [16 / 9, 9 / 16]) {
    bounds = computeTankBounds({ fovDeg: 45, cameraZ: 14, aspect });
    module.update(2);
    for (const child of scene.children) {
      const { x, y, z } = child.position;
      expect(y).toBeCloseTo(ctx.getHeight(x, z));
      const ratio = Math.abs(x) / (bounds.max.x * (14 - z) / 14);
      expect(ratio).toBeGreaterThanOrEqual(0.48);
      expect(ratio).toBeLessThanOrEqual(0.9);
    }
  }
  module.dispose(); copy.dispose(); expect(scene.children).toHaveLength(0);
});
it('updates and disposes bubble instances without WebGL', () => {
  const scene = new Scene();
  const module = createBubbles(scene, { random: createRandom(42), getBounds: () => ({ min: { x: -5, y: -4, z: -8 }, max: { x: 5, y: 4, z: 3 } }), getHeight: () => -4.3 });
  module.update(20); expect(scene.children[0].name).toBe('bubbles');
  module.dispose(); expect(scene.children).toHaveLength(0);
});
