import { Vector3 } from 'three';
import { FIST_GATHER_PARAMS as p, FISH_PARAMS } from '../config/params';
import type { Pointer } from '../input/types';
import { isTransitioning, type Fish } from './fish-state';

export function gatherCenters(pointers: readonly Pointer[], screenToWorld: (x: number, y: number, z: number) => Vector3): Vector3[] {
  return pointers.filter(pointer=>pointer.fist).map(pointer=>screenToWorld(pointer.x,pointer.y,p.centerZ));
}
export function computeGatherForce(fish: Fish, centers: readonly Vector3[]): Vector3 | null {
  if(fish.mode!=='swimming'||isTransitioning(fish)||!centers.length) return null;
  let center=centers[0];
  for(const candidate of centers) if(fish.position.distanceToSquared(candidate)<fish.position.distanceToSquared(center)) center=candidate;
  const d=fish.position.clone().sub(center),radius=Math.hypot(d.x,d.y);
  const x=radius>1e-12?d.x/radius:Math.cos(fish.phase),y=radius>1e-12?d.y/radius:Math.sin(fish.phase);
  const radial=(p.radius-radius)*p.radialGain;
  return new Vector3(
    x*radial+(-y*p.orbitSpeed-fish.velocity.x)*p.tangentGain,
    y*radial+(x*p.orbitSpeed-fish.velocity.y)*p.tangentGain,
    (center.z+p.depthSpread*Math.sin(fish.phase)-fish.position.z)*p.depthGain,
  ).clampLength(0,FISH_PARAMS.maxSteeringForce);
}
