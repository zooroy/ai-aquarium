import { PerspectiveCamera, Scene, Vector3, Mesh, MeshLambertMaterial, FrontSide } from 'three';
import { expect, it } from 'vitest';
import { HandAvatar } from '../../../src/render/hand/hand-avatar';
import { advanceHandBubbles, bubbleOpacity, transformHandJoints } from '../../../src/render/hand/hand-transforms';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { HAND_PARAMS } from '../../../src/config/params';
function pose() { const provider = new HandProvider(); provider.ingest(createReplaySource(getReplayScript('demo')).frameAt(0), 0); return provider.getHandPose(300); }
it('keeps provider mirror/y-up and aligns pinch midpoint without scaling camera distance', () => {
  const state = pose(), target = new Vector3(2,3,2);
  const joints = transformHandJoints(state,target);
  expect(joints[4].clone().add(joints[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-12);
  const delta = joints[0].clone().sub(joints[9]);
  expect(delta.y).toBeCloseTo((state.joints[0].y-state.joints[9].y)*HAND_PARAMS.worldScale);
  expect(delta.x).toBeCloseTo((state.joints[0].x-state.joints[9].x)*HAND_PARAMS.worldScale);
  const shifted = transformHandJoints(state,new Vector3(0,0,-5));
  expect(shifted[0].distanceTo(shifted[9])).toBeCloseTo(joints[0].distanceTo(joints[9]));
});
it('advances particles without mutation and expires at 0.8 seconds', () => {
  const particles=[{position:new Vector3(),velocity:new Vector3(0,1,0),age:0}];
  const moved=advanceHandBubbles(particles,.4);
  expect(moved[0].position.y).toBe(.4); expect(particles[0].position.y).toBe(0);
  expect(bubbleOpacity(moved[0].age)).toBe(.5);
  expect(advanceHandBubbles(moved,.4)).toEqual([]);
});
it('uses one non-indexed hand mesh, stable buffers, fade and bubble lifecycle', () => {
  const scene=new Scene(), avatar=new HandAvatar(scene,new PerspectiveCamera()), state=pose();
  avatar.sync(state,0,()=>new Vector3(0,0,2));
  const root=scene.children[0], hand=root.children[0] as Mesh;
  expect((hand.material as MeshLambertMaterial).side).toBe(FrontSide);
  expect(hand.name).toBe('hand-surface'); expect(hand.geometry.index).toBeNull();
  expect(root.children).toHaveLength(9); // One hand plus eight burst particles.
  const position=hand.geometry.getAttribute('position'), color=hand.geometry.getAttribute('color');
  const before=Array.from(color.array);
  avatar.sync({...state,pressed:true},.01,()=>new Vector3(0,0,2));
  expect(hand.geometry.getAttribute('position')).toBe(position);
  expect(hand.geometry.getAttribute('color')).toBe(color);
  expect(Array.from(color.array)).not.toEqual(before);
  expect(root.children.slice(1).filter(c=>c.visible)).toHaveLength(8);
  avatar.sync({...state,pressed:true},.81,()=>new Vector3(0,0,2));
  expect(root.children.slice(1).every(c=>!c.visible)).toBe(true);
  avatar.sync({...state,visible:false,opacity:0},.1,()=>new Vector3()); expect(root.visible).toBe(false);
  avatar.dispose(); expect(scene.children).toHaveLength(0);
});
it('tilts around the pinch midpoint without moving the cursor or changing hand size', async()=>{
  const {tiltHandJoints}=await import('../../../src/render/hand/hand-transforms');
  const {handFrame}=await import('../../../src/render/hand/hand-mesh');
  const target=new Vector3(2,-1,2.5), original=transformHandJoints(pose(),target), tilted=tiltHandJoints(original);
  expect(tilted[4].clone().add(tilted[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-12);
  expect(handFrame(original).normal.angleTo(handFrame(tilted).normal)).toBeGreaterThan(.2);
  for(let i=0;i<21;i++) expect(tilted[i].distanceTo(tilted[0])).toBeCloseTo(original[i].distanceTo(original[0]));
});
