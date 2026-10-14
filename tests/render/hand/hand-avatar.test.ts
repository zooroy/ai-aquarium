import { PerspectiveCamera, Scene, Vector3, Mesh, MeshLambertMaterial, FrontSide, Group, BufferGeometry, Float32BufferAttribute, SkinnedMesh } from 'three';
import { expect, it, vi } from 'vitest';
import { HandAvatar } from '../../../src/render/hand/hand-avatar';
import { advanceHandBubbles, bubbleOpacity, transformHandJoints } from '../../../src/render/hand/hand-transforms';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { HAND_PARAMS, HAND_RENDER_PARAMS } from '../../../src/config/params';
import { readFileSync } from 'node:fs';
import { parseGlb } from '../../../scripts/hand-model.mjs';
function load() {
  const group=new Group();
  for(const data of parseGlb(readFileSync('public/models/low-poly-hands.rigged.glb'))) {
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(data.vertices.flat(),3));
    const mesh=new Mesh(geometry,new MeshLambertMaterial());mesh.name=data.name;group.add(mesh);
  }
  return Promise.resolve(group);
}
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
it('loads skinned hands asynchronously, fades, updates depthWrite and releases resources', async () => {
  const scene=new Scene(), avatar=new HandAvatar(scene,new PerspectiveCamera(),{load,debugRig:true}), state=pose();
  avatar.sync(state,0,()=>new Vector3(0,0,2));expect(scene.children[0].visible).toBe(false);
  await avatar.ready;
  avatar.sync(state,0,()=>new Vector3(0,0,2));
  const root=scene.children[0], hands=root.children.filter(c=>c instanceof SkinnedMesh) as SkinnedMesh[];
  expect(hands).toHaveLength(2);expect(hands.filter(h=>h.visible)).toHaveLength(1);
  const hand=hands.find(h=>h.visible)!;
  expect(hand.skeleton.bones).toHaveLength(16);
  const mat=hand.material as MeshLambertMaterial;expect(mat.side).toBe(FrontSide);expect(mat.depthWrite).toBe(true);
  const colors=hand.geometry.getAttribute('color'),base=Array.from(colors.array);
  avatar.sync({...state,pressed:true,opacity:.5},.01,()=>new Vector3(0,0,2));
  expect(mat.depthWrite).toBe(false);expect(Array.from(colors.array)).not.toEqual(base);
  expect(root.children.slice(0,8).filter(c=>c.visible)).toHaveLength(8);
  avatar.sync({...state,pressed:true},.81,()=>new Vector3(0,0,2));expect(root.children.slice(0,8).every(c=>!c.visible)).toBe(true);
  avatar.sync({...state,visible:false,opacity:0},.1,()=>new Vector3());expect(root.visible).toBe(false);
  avatar.dispose();expect(scene.children).toHaveLength(0);
});
it('handles load failure and disposal during loading without displaying a hand',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const scene=new Scene(), failed=new HandAvatar(scene,new PerspectiveCamera(),{load:()=>Promise.reject(Error('missing'))});
  await failed.ready;expect(scene.children[0].visible).toBe(false);expect(warn).toHaveBeenCalled();failed.dispose();
  let resolve!:(g:Group)=>void;
  const avatar=new HandAvatar(scene,new PerspectiveCamera(),{load:()=>new Promise(r=>{resolve=r;})});
  await Promise.resolve();avatar.dispose();resolve(await load());await avatar.ready;expect(scene.children).toHaveLength(0);warn.mockRestore();
});
it('tilts around the pinch midpoint without moving the cursor or changing hand size', async()=>{
  const {tiltHandJoints}=await import('../../../src/render/hand/hand-transforms');
  const {handFrame}=await import('../../../src/render/hand/hand-rig');
  const target=new Vector3(2,-1,2.5), original=transformHandJoints(pose(),target), tilted=tiltHandJoints(original);
  expect(tilted[4].clone().add(tilted[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-12);
  expect(handFrame(original).normal.angleTo(handFrame(tilted).normal)).toBeCloseTo(0);
  expect(HAND_RENDER_PARAMS.displayTiltAcross).toBe(0);expect(HAND_RENDER_PARAMS.displayTiltUp).toBe(0);
  for(let i=0;i<21;i++) expect(tilted[i].distanceTo(tilted[0])).toBeCloseTo(original[i].distanceTo(original[0]));
});
