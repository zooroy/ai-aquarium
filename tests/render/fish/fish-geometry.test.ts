import { expect, it } from 'vitest';
import { createFishGeometry } from '../../../src/render/fish/fish-geometry';
it('creates a centered unit-length non-indexed low-poly fish with three color regions', () => {
  const geometry = createFishGeometry();
  const positions = geometry.getAttribute('position');
  expect(positions.count / 3).toBeGreaterThanOrEqual(100);
  expect(positions.count / 3).toBeLessThanOrEqual(200);
  expect(geometry.index).toBeNull();
  const box = geometry.boundingBox!;
  expect(box.max.x - box.min.x).toBeCloseTo(1);
  expect(box.max.x + box.min.x).toBeCloseTo(0);
  expect(box.max.x).toBeGreaterThan(0);
  const colors = geometry.getAttribute('color');
  expect(new Set(Array.from({ length: colors.count }, (_, i) => `${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`))).toEqual(new Set(['1,0,0', '0,1,0', '0,0,1']));
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1);
  geometry.dispose();
});
