import { PerspectiveCamera, Scene, Vector3, Mesh, MeshStandardMaterial, Texture, FrontSide, Group, BufferGeometry, Float32BufferAttribute, SkinnedMesh } from 'three';
import { expect, it, vi } from 'vitest';
import { HandAvatar } from '../../../src/render/hand/hand-avatar';
import { advanceHandBubbles, bubbleOpacity, transformHandJoints } from '../../../src/render/hand/hand-transforms';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { HAND_PARAMS, HAND_RENDER_PARAMS } from '../../../src/config/params';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readNativeFixture, texturelessGlb } from './glb-fixture';
async function load() {
  const model=(await new GLTFLoader().parseAsync(texturelessGlb(),'')).scene;
  model.traverse(o=>{if(o instanceof SkinnedMesh) (o.material as MeshStandardMaterial).map=new Texture();});
  return model;
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
  const root=scene.children[0], hands:SkinnedMesh[]=[];root.traverse(c=>{if(c instanceof SkinnedMesh)hands.push(c);});
  expect(hands).toHaveLength(1);
  const hand=hands.find(h=>h.visible)!;
  expect(hand.skeleton.bones).toHaveLength(readNativeFixture().json.skins[0].joints.length);
  const mat=hand.material as MeshStandardMaterial;expect(mat.side).toBe(FrontSide);expect(mat.depthWrite).toBe(true);
  expect(mat.map).toBeInstanceOf(Texture);expect(mat.vertexColors).toBe(false);
  expect(hand.geometry.getAttribute('color')).toBeUndefined();const base=mat.color.clone();
  avatar.sync({...state,fist: false, pressed: true,opacity:.5},.01,()=>new Vector3(0,0,2));
  expect(mat.depthWrite).toBe(false);expect(mat.color).toEqual(base);
  expect(root.children.slice(1,9).filter(c=>c.visible)).toHaveLength(8);
  avatar.sync({...state,fist: false, pressed: true},.81,()=>new Vector3(0,0,2));expect(root.children.slice(1,9).every(c=>!c.visible)).toBe(true);
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
it('retains native weights/bind matrices and bone offsets while mirroring the outer root',async()=>{
  const model=await load();let source:SkinnedMesh|undefined;
  model.traverse(o=>{if(o instanceof SkinnedMesh)source=o;});const mesh=source!;
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
  const inverses=mesh.skeleton.boneInverses.map(m=>m.clone());
  const offsets=mesh.skeleton.bones.map(b=>b.position.clone());
  const scene=new Scene(),avatar=new HandAvatar(scene,new PerspectiveCamera(),{load:()=>Promise.resolve(model),debugRig:true});await avatar.ready;
  const state=pose();
  for(const mirror of [false,true]) {
    state.handedness=mirror?'left':'right';
    const joints=state.joints.map(p=>({...p,x:mirror?-p.x:p.x}));
    avatar.sync({...state,joints},.016,()=>new Vector3(0,0,2.5));
    expect(mesh.geometry.getAttribute('skinIndex')).toBe(indices);expect(mesh.geometry.getAttribute('skinWeight')).toBe(weights);
    mesh.skeleton.bones.forEach((bone,i)=>expect(bone.position).toEqual(offsets[i]));
    mesh.skeleton.boneInverses.forEach((inverse,i)=>expect(inverse).toEqual(inverses[i]));
  }
  expect(scene.children[0].children).toHaveLength(1+8+42);
  avatar.dispose();
});
it('places orange retarget markers over actual driven joints after pinch alignment for either hand',async()=>{
  const {ROOT_BONE,FINGER_BONES,loadedBoneName,pinchAssistWeight}=await import('../../../src/render/hand/hand-rig');
  const fixture=readNativeFixture(),scene=new Scene(),avatar=new HandAvatar(scene,new PerspectiveCamera(),{load,debugRig:true});await avatar.ready;
  for(const time of [1000,5000]) for(const mirror of [false,true]) {
    const provider=new HandProvider();provider.ingest(createReplaySource(getReplayScript('demo')).frameAt(time),time);
    const state=provider.getHandPose(time+100);
    state.handedness=mirror?'left':'right';
    if(mirror) state.joints=state.joints.map(p=>({...p,x:-p.x}));
    const target=new Vector3(.3,-.2,2.5);avatar.sync(state,.016,()=>target);
    const root=scene.children[0],orange=root.children.slice(1+8+21);
    const bones=[ROOT_BONE,...FINGER_BONES.flat()];
    const actual=bones.map(name=>root.getObjectByName(loadedBoneName(name))!.getWorldPosition(new Vector3()));
    const palm=actual[0].distanceTo(actual[9]);
    actual.forEach((point,i)=>{if(i>=2&&i<=8&&pinchAssistWeight(state.joints.map(p=>new Vector3(p.x,p.y,p.z)))>0)return;expect(point.distanceTo(orange[i].position)).toBeLessThan(palm*.05);});
    expect(actual[4].clone().add(actual[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-5);
    if(time===5000) {
      const center=[0,5,9,13,17].reduce((v,i)=>v.add(actual[i]),new Vector3()).divideScalar(5);
      expect(actual[4].z).toBeLessThan(center.z);expect(actual[8].z).toBeLessThan(center.z);
    }
  }
  avatar.dispose();
});

it('classifies the right-hand replay as right and mirrors the native left glove',async()=>{
  const state=pose();
  expect(state.handedness).toBe('right');
  const scene=new Scene(),avatar=new HandAvatar(scene,new PerspectiveCamera(),{load});
  await avatar.ready;
  avatar.sync(state,0,()=>new Vector3(0,0,2.5));
  expect(scene.children[0].children[0].matrix.determinant()).toBeLessThan(0);
  avatar.dispose();
});
