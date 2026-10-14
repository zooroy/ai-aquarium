import { Vector3 } from 'three';
import { CUSTOM_FISH_PARAMS as p, FISH_PARAMS } from '../config/params';
import type { Random } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';
import type { Fish } from './fish-state';

/** Caller supplies max(existing numeric id)+1; storage metadata is not needed by simulation. */
export function spawnCustomFish(record: { id: string }, bounds: TankBounds, random: Random, nextId: number): Fish {
  const position = new Vector3();
  for (const axis of ['x','y','z'] as const) {
    const center = (bounds.min[axis]+bounds.max[axis])/2;
    const spread = (bounds.max[axis]-bounds.min[axis])*p.spawnSpreadRatio;
    position[axis] = center+random.range(-spread,spread);
  }
  const angle = random.range(0,Math.PI*2);
  const forward = new Vector3(Math.cos(angle),0,Math.sin(angle));
  return {id:nextId, customId:record.id, position, forward,
    velocity:forward.clone().multiplyScalar(FISH_PARAMS.maxSpeed),
    variant:-1, scale:p.scale, phase:random.range(0,Math.PI*2),
    mode:'swimming',panic:0,fleeTime:0};
}
/** Mutates the school, matching the simulation's in-place update convention. */
export function removeCustomFish(fish: Fish[], customId: string): void {
  for(let i=fish.length-1;i>=0;i--) if(fish[i].customId===customId) fish.splice(i,1);
}
export function canAddCustomFish(fish: readonly Fish[]): boolean {
  // Fish already swimming away no longer occupy a slot.
  return fish.filter(item => item.customId !== undefined && item.mode !== 'leaving').length < p.maxCount;
}
