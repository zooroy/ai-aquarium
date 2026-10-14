import { expect, it } from 'vitest';
import { assetUrl } from '../../src/core/asset-url';

it('joins public assets onto the Vite base', () => {
  expect(assetUrl('mediapipe/wasm', '/')).toBe('/mediapipe/wasm');
  expect(assetUrl('models/vr-hand-right.glb', '/ai-aquarium/')).toBe('/ai-aquarium/models/vr-hand-right.glb');
  expect(assetUrl('/models/x.glb', '/ai-aquarium')).toBe('/ai-aquarium/models/x.glb');
});
