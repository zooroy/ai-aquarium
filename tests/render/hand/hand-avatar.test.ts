import { Matrix4, PerspectiveCamera, Quaternion, Scene, Vector3, InstancedMesh } from 'three';
import { expect, it } from 'vitest';
import { HandAvatar } from '../../../src/render/hand/hand-avatar';
import { advanceHandBubbles, boneTransform, bubbleOpacity, transformHandJoints } from '../../../src/render/hand/hand-transforms';
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
it('places cylinder midpoint, length and positive Y along bone', () => {
  const a=new Vector3(1,2,3), b=new Vector3(-2,4,1), matrix=boneTransform(a,b);
  const pos=new Vector3(),rot=new Quaternion(),scale=new Vector3(); matrix.decompose(pos,rot,scale);
  expect(pos).toEqual(a.clone().add(b).multiplyScalar(.5));
  expect(scale.y).toBeCloseTo(a.distanceTo(b));
  expect(new Vector3(0,1,0).applyQuaternion(rot).distanceTo(b.clone().sub(a).normalize())).toBeLessThan(1e-12);
  expect(boneTransform(a,a).elements.every(Number.isFinite)).toBe(true);
});
it('advances particles without mutation and expires at 0.8 seconds', () => {
  const particles=[{position:new Vector3(),velocity:new Vector3(0,1,0),age:0}];
  const moved=advanceHandBubbles(particles,.4);
  expect(moved[0].position.y).toBe(.4); expect(particles[0].position.y).toBe(0);
  expect(bubbleOpacity(moved[0].age)).toBe(.5);
  expect(advanceHandBubbles(moved,.4)).toEqual([]);
});
it('builds joint/bone instances, fades and removes resources', () => {
  const scene=new Scene(), avatar=new HandAvatar(scene,new PerspectiveCamera()); const state=pose();
  avatar.sync(state,0,()=>new Vector3(0,0,2));
  const root=scene.children[0]; expect(root.visible).toBe(true);
  expect((root.children[0] as InstancedMesh).count).toBe(21);
  expect((root.children[1] as InstancedMesh).count).toBe(20);
  avatar.sync({...state,pressed:true},.01,()=>new Vector3(0,0,2));
  expect(root.children.slice(4).filter((c)=>c.visible)).toHaveLength(8);
  avatar.sync({...state,pressed:true},.81,()=>new Vector3(0,0,2));
  expect(root.children.slice(4).every((c)=>!c.visible)).toBe(true);
  avatar.sync({...state,visible:false,opacity:0},.1,()=>new Vector3()); expect(root.visible).toBe(false);
  avatar.dispose(); expect(scene.children).toHaveLength(0);
});

it('uses chunky bone radii and larger adjacent joints', async () => {
  const { handRadii } = await import('../../../src/render/hand/hand-transforms');
  const points = [new Vector3(), new Vector3(0,1,0), new Vector3(0,2,0)];
  const edges = [[0,1],[1,2]];
  const radii = handRadii(points,edges);
  radii.bones.forEach((radius) => { expect(radius).toBeGreaterThanOrEqual(.3); expect(radius).toBeLessThanOrEqual(.35); });
  edges.forEach(([a,b],i) => { expect(radii.joints[a]).toBeGreaterThan(radii.bones[i]); expect(radii.joints[b]).toBeGreaterThan(radii.bones[i]); });
  const matrix = boneTransform(points[0],points[1],radii.bones[0]);
  expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(.35);
});
