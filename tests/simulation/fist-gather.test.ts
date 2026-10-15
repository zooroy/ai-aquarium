import { Vector3 } from 'three';
import { expect,it,vi } from 'vitest';
import { gatherCenters,computeGatherForce } from '../../src/simulation/fist-gather';
import { computeAvoidanceForce } from '../../src/simulation/cursor-avoidance';
import { stepSchool } from '../../src/simulation/boids';
import { createSchool } from '../../src/simulation/fish-state';
import { createRandom } from '../../src/core/random';
import { computeTankBounds } from '../../src/core/tank-bounds';
import { FIST_GATHER_PARAMS as p,FISH_PARAMS,TANK_PARAMS } from '../../src/config/params';
const bounds=computeTankBounds({fovDeg:TANK_PARAMS.cameraFov,cameraZ:TANK_PARAMS.cameraPosition.z,aspect:16/9});
const pointer={id:'hand',source:'hand' as const,x:.5,y:.5,pressed:false,fist:true};
const screenToWorld=(x:number,y:number,z:number)=>new Vector3((x-.5)*10,(.5-y)*10,z);
const projectToScreen=(v:Vector3)=>({x:.5+v.x/10,y:.5-v.y/10});
it('maps only fist pointers and chooses the nearest center in 3D without mutating inputs',()=>{
 const project=vi.fn(screenToWorld);
 const centers=gatherCenters([pointer,{...pointer,id:'open',fist:false},{...pointer,id:'second',x:.8}],project);
 expect(project).toHaveBeenCalledTimes(2);expect(centers[0]).toEqual(new Vector3(0,0,p.centerZ));expect(centers[1].distanceTo(new Vector3(3,0,p.centerZ))).toBeLessThan(1e-12);
 const fish=createSchool(1,bounds,createRandom(42))[0];fish.position.set(3,0,p.centerZ);
 const position=fish.position.clone(),velocity=fish.velocity.clone();
 expect(computeGatherForce(fish,centers)).toEqual(computeGatherForce(fish,[centers[1]]));
 expect(computeGatherForce(fish,[...centers].reverse())).toEqual(computeGatherForce(fish,[centers[1]]));
 expect(fish.position).toEqual(position);expect(fish.velocity).toEqual(velocity);
 expect(computeGatherForce(fish,centers)!.length()).toBeLessThanOrEqual(FISH_PARAMS.maxSteeringForce+1e-10);
 for(const mode of ['grabbed','fleeing','dropping','leaving'] as const) expect(computeGatherForce({...fish,mode},centers)).toBeNull();
 expect(computeGatherForce(fish,[])).toBeNull();
});
it('gathers 60 fish within five seconds, orbits counterclockwise and releases safely',()=>{
 const fish=createSchool(60,bounds,createRandom(42));
 const centers=gatherCenters([pointer],screenToWorld);
 const verify=()=>{for(const f of fish) {
   expect(f.velocity.length()).toBeGreaterThanOrEqual(FISH_PARAMS.minSpeed-1e-10);
   expect(f.velocity.length()).toBeLessThanOrEqual(FISH_PARAMS.maxSpeed+1e-10);
   for(const axis of ['x','y','z'] as const) {expect(f.position[axis]).toBeGreaterThanOrEqual(bounds.min[axis]);expect(f.position[axis]).toBeLessThanOrEqual(bounds.max[axis]);}
 }};
 for(let i=0;i<300;i++) {stepSchool(fish,1/60,{bounds,time:i/60,pointers:[pointer],screenToWorld,projectToScreen});verify();}
 const swimming=fish.filter(f=>f.mode==='swimming');
 const ring=swimming.filter(f=>Math.abs(Math.hypot(f.position.x,f.position.y)-p.radius)<=p.band);
 const ccw=ring.filter(f=>f.position.x*f.velocity.y-f.position.y*f.velocity.x>0);
 expect(ring.length/swimming.length).toBeGreaterThanOrEqual(.7);expect(ccw.length/ring.length).toBeGreaterThanOrEqual(.8);
 const open={...pointer,fist:false};
 const probe={...fish[0],position:new Vector3(.1,0,0)};
 expect(computeAvoidanceForce(probe,[pointer],projectToScreen).length()).toBe(0);
 expect(computeAvoidanceForce(probe,[open],projectToScreen).length()).toBeGreaterThan(0);
 for(let i=300;i<420;i++) {
   const released=gatherCenters([open],screenToWorld);expect(released).toEqual([]);
   expect(computeGatherForce(fish[0],released)).toBeNull();
   stepSchool(fish,1/60,{bounds,time:i/60,pointers:[open],screenToWorld,projectToScreen});verify();
 }
 expect(centers).toEqual([new Vector3(0,0,p.centerZ)]);
});
