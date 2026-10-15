import { HAND_PARAMS as p } from '../../config/params';
import type { Landmark } from './types';
export function fistRatio(world: readonly Landmark[]): number {
  if(world.length<21 || world.some(point=>![point.x,point.y,point.z].every(Number.isFinite))) return Infinity;
  const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const palm=distance(world[0],world[9]);
  if(palm===0) return Infinity;
  return [8,12,16,20].reduce((sum,i)=>sum+distance(world[0],world[i]),0)/4/palm;
}
export class FistDetector {
  private fist=false;
  update(ratio:number):boolean {
    if(ratio<p.fistEnter) this.fist=true;
    else if(ratio>p.fistExit) this.fist=false;
    return this.fist;
  }
  reset():void { this.fist=false; }
}
