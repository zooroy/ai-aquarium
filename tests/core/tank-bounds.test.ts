import { describe, expect, it } from 'vitest';
import { TANK_PARAMS } from '../../src/config/params';
import { computeTankBounds } from '../../src/core/tank-bounds';

const camera = { fovDeg: TANK_PARAMS.cameraFov, cameraZ: TANK_PARAMS.cameraPosition.z };

describe('computeTankBounds', () => {
  it.each([16 / 9, 9 / 16])('returns ordered bounds and fixed depth for aspect %s', (aspect) => {
    const bounds = computeTankBounds({ ...camera, aspect });
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(bounds.min[axis]).toBeLessThan(bounds.max[axis]);
    }
    expect(bounds.min.z).toBe(-8);
    expect(bounds.max.z).toBe(1.5);
    expect(bounds.min.x).toBe(-bounds.max.x);
  });

  it('changes only horizontal extent with aspect ratio', () => {
    const landscape = computeTankBounds({ ...camera, aspect: 16 / 9 });
    const portrait = computeTankBounds({ ...camera, aspect: 9 / 16 });
    expect(landscape.max.x).toBeGreaterThan(portrait.max.x);
    expect(landscape.max.x / portrait.max.x).toBeCloseTo((16 / 9) / (9 / 16));
    expect(landscape.min.y).toBe(portrait.min.y);
    expect(landscape.max.y).toBe(portrait.max.y);
  });

  it('uses the z=0 viewing plane and deducts margins from the scaled full height', () => {
    // A 90 degree vertical FOV at distance 10 has half-height 10.
    const bounds = computeTankBounds({ fovDeg: 90, cameraZ: 10, aspect: 2 });
    const halfHeight = 10 * TANK_PARAMS.visibleAreaRatio;
    expect(bounds.max.x).toBeCloseTo(2 * halfHeight);
    expect(bounds.min.y).toBeCloseTo(-halfHeight + 2 * halfHeight * TANK_PARAMS.bottomMarginRatio);
    expect(bounds.max.y).toBeCloseTo(halfHeight - 2 * halfHeight * TANK_PARAMS.topMarginRatio);
    expect(bounds.min.y).toBeGreaterThan(-halfHeight);
    expect(bounds.max.y).toBeLessThan(halfHeight);
  });

  it('scales with camera distance', () => {
    const near = computeTankBounds({ ...camera, aspect: 1 });
    const far = computeTankBounds({ ...camera, cameraZ: camera.cameraZ * 2, aspect: 1 });
    expect(far.max.x).toBeCloseTo(near.max.x * 2);
    expect(far.min.y).toBeCloseTo(near.min.y * 2);
    expect(far.max.y).toBeCloseTo(near.max.y * 2);
  });

  it.each([
    { fovDeg: 0 }, { fovDeg: 180 }, { cameraZ: 0 }, { aspect: 0 }, { aspect: NaN },
  ])('rejects invalid camera inputs %o', (invalid) => {
    expect(() => computeTankBounds({ ...camera, aspect: 1, ...invalid })).toThrow(RangeError);
  });
});
