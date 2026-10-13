import { Vector3 } from 'three';
import { FISH_PARAMS } from '../config/params';
import { PALETTE } from '../config/palette';
import type { Random } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';

export interface Fish {
  id: number;
  position: Vector3;
  velocity: Vector3;
  forward: Vector3; // 單位向量，平滑後的朝向。
  variant: number; // 配色索引。
  scale: number;
  phase: number;
}

export function createSchool(count: number, bounds: TankBounds, random: Random): Fish[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Expected nonnegative integer count');
  return Array.from({ length: count }, (_, id) => {
    const position = new Vector3(
      random.range(bounds.min.x, bounds.max.x),
      random.range(bounds.min.y, bounds.max.y),
      random.range(bounds.min.z, bounds.max.z),
    );
    // 球面均勻取樣，不依賴 Vector3.randomDirection 的全域亂數。
    const z = random.range(-1, 1);
    const angle = random.range(0, Math.PI * 2);
    const radius = Math.sqrt(1 - z * z);
    const forward = new Vector3(radius * Math.cos(angle), radius * Math.sin(angle), z);
    return {
      id, position, forward,
      velocity: forward.clone().multiplyScalar(random.range(FISH_PARAMS.minSpeed, FISH_PARAMS.maxSpeed)),
      variant: id % PALETTE.fish.length,
      scale: random.range(FISH_PARAMS.minScale, FISH_PARAMS.maxScale),
      phase: random.range(0, Math.PI * 2),
    };
  });
}
