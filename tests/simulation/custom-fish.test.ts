import { Vector3 } from 'three';
import { expect,it } from 'vitest';
import { spawnCustomFish,removeCustomFish,canAddCustomFish } from '../../src/simulation/custom-fish';
import { createSchool } from '../../src/simulation/fish-state';
import { GrabController } from '../../src/simulation/grab';
import { createRandom } from '../../src/core/random';
import { CUSTOM_FISH_PARAMS as p,FISH_PARAMS } from '../../src/config/params';
const bounds={min:{x:-5,y:-3,z:-8},max:{x:5,y:3,z:1.5}};
it('spawns deterministic central horizontal fish with unique caller-assigned ids and max speed',()=>{
  const random=createRandom(42),fish=Array.from({length:20},(_,i)=>spawnCustomFish({id:String(i)},bounds,random,60+i));
  expect(new Set(fish.map(f=>f.id)).size).toBe(20);
  expect(fish[0]).toEqual(spawnCustomFish({id:'0'},bounds,createRandom(42),60));
  for(const f of fish) {
    expect(f.variant).toBe(-1);expect(f.scale).toBe(1.2);expect(f.velocity.y).toBe(0);
    expect(f.velocity.length()).toBeCloseTo(FISH_PARAMS.maxSpeed);
    expect(f.forward.length()).toBeCloseTo(1);
    for(const a of ['x','y','z'] as const) expect(Math.abs(f.position[a]-(bounds.min[a]+bounds.max[a])/2)).toBeLessThanOrEqual((bounds.max[a]-bounds.min[a])*p.spawnSpreadRatio);
  }
  const school=createSchool(60,bounds,random);
  expect(canAddCustomFish([...school,...fish.slice(0,19)])).toBe(true);
  expect(canAddCustomFish([...school,...fish])).toBe(false);
  removeCustomFish(fish,'0');expect(fish).toHaveLength(19);expect(canAddCustomFish(fish)).toBe(true);
});
it('releases a deleted held fish on the next update and can grab again',()=>{
  const fish=[spawnCustomFish({id:'custom'},bounds,createRandom(1),60)];
  fish[0].position.set(0,0,0);
  const removed=fish[0],grab=new GrabController();
  const ctx={bounds,aspect:1,projectToScreen:(p:Vector3)=>({x:.5+p.x/10,y:.5-p.y/10}),
    screenToWorld:(x:number,y:number,z:number)=>new Vector3((x-.5)*10,(.5-y)*10,z)};
  const pointer={id:'mouse',source:'mouse' as const,x:.5,y:.5,pressed:true};
  grab.update({pointers:[pointer]},fish,0,ctx);expect(removed.mode).toBe('grabbed');
  removeCustomFish(fish,'custom');grab.update({pointers:[pointer]},fish,0,ctx);
  expect(removed.mode).toBe('fleeing');expect(fish).toHaveLength(0);
  fish.push(spawnCustomFish({id:'next'},bounds,createRandom(2),61));fish[0].position.set(0,0,0);
  grab.update({pointers:[]},fish,0,ctx);grab.update({pointers:[pointer]},fish,0,ctx);
  expect(fish[0].mode).toBe('grabbed');
});
