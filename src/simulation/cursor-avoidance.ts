import { Vector3 } from 'three';
import { CURSOR_PARAMS } from '../config/params';
import type { Pointer } from '../input/types';
import type { Fish } from './fish-state';

export function computeAvoidanceForce(
  fish: Fish,
  pointers: readonly Pointer[],
  projectToScreen: (p: Vector3) => { x: number; y: number },
): Vector3 {
  const force = new Vector3();
  if (pointers.length === 0) return force;
  const screen = projectToScreen(fish.position);
  for (const pointer of pointers) {
    if (pointer.fist) continue;
    const dx = screen.x - pointer.x;
    const dy = pointer.y - screen.y; // 螢幕 y 向下，world y 向上。
    const distance = Math.hypot(dx, dy);
    if (distance >= CURSOR_PARAMS.avoidanceRadius) continue;
    const strength = 1 - distance / CURSOR_PARAMS.avoidanceRadius;
    if (distance > 0) force.add(new Vector3(dx / distance, dy / distance, 0).multiplyScalar(strength));
    // 完全重合時用個體相位決定方向，避免零向量使魚困在游標中心。
    else force.add(new Vector3(Math.cos(fish.phase), Math.sin(fish.phase), 0));
  }
  return force;
}
