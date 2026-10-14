import { describe, expect, it } from 'vitest';
import { CUSTOM_FISH_PARAMS } from '../../src/config/params';
import { brushPixels, clientToUv, hexColor, uvToCanvas } from '../../src/drawing/canvas-mapping';

describe('canvas mapping', () => {
  it('flips v so the top of the canvas is v = 1', () => {
    expect(uvToCanvas({ u: 0, v: 1 }, 512, 256)).toEqual({ x: 0, y: 0 });
    expect(uvToCanvas({ u: 1, v: 0 }, 512, 256)).toEqual({ x: 512, y: 256 });
    expect(uvToCanvas({ u: 0.5, v: 0.5 }, 512, 256)).toEqual({ x: 256, y: 128 });
  });

  it('maps client positions inside a scaled canvas rect back to uv, and round-trips', () => {
    const rect = { left: 100, top: 50, width: 256, height: 128 };
    expect(clientToUv(100, 50, rect)).toEqual({ u: 0, v: 1 });
    expect(clientToUv(356, 178, rect)).toEqual({ u: 1, v: 0 });
    const uv = clientToUv(164, 82, rect);
    const back = uvToCanvas(uv, 256, 128);
    expect(back.x + rect.left).toBeCloseTo(164);
    expect(back.y + rect.top).toBeCloseTo(82);
  });

  it('clamps pointers outside the canvas to its edge', () => {
    const rect = { left: 0, top: 0, width: 200, height: 100 };
    expect(clientToUv(-20, 150, rect)).toEqual({ u: 0, v: 0 });
    expect(clientToUv(260, -5, rect)).toEqual({ u: 1, v: 1 });
  });

  it('scales brush sizes with the canvas width', () => {
    expect(brushPixels('small')).toBe(CUSTOM_FISH_PARAMS.brushSizes.small);
    expect(brushPixels('large', CUSTOM_FISH_PARAMS.textureWidth / 2)).toBe(CUSTOM_FISH_PARAMS.brushSizes.large / 2);
    expect(brushPixels('small')).toBeLessThan(brushPixels('medium'));
    expect(brushPixels('medium')).toBeLessThan(brushPixels('large'));
  });

  it('formats hex colors with leading zeros', () => {
    expect(hexColor(0x0000ff)).toBe('#0000ff');
    expect(hexColor(0xf2e5d4)).toBe('#f2e5d4');
  });
});
