import { CylinderGeometry, PerspectiveCamera, Quaternion, Scene, Vector3, InstancedMesh } from 'three';
import { expect, it } from 'vitest';
import { HandAvatar } from '../../../src/render/hand/hand-avatar';
import { advanceHandBubbles, boneTransform, bubbleOpacity, transformHandJoints } from '../../../src/render/hand/hand-transforms';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { HAND_PARAMS, HAND_RENDER_PARAMS } from '../../../src/config/params';
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
it('builds only 15 tapered finger instances without joint meshes, fades and removes resources', () => {
  const scene=new Scene(), avatar=new HandAvatar(scene,new PerspectiveCamera()); const state=pose();
  avatar.sync(state,0,()=>new Vector3(0,0,2));
  const root=scene.children[0]; expect(root.visible).toBe(true);
  const bones = root.children[0] as InstancedMesh<CylinderGeometry>;
  expect(bones.count).toBe(15);
  expect(Array.from(bones.geometry.getAttribute('aTipRatio').array)).toEqual(
    Array.from({length:15}, (_,i) => i % 3 === 2 ? Math.fround(HAND_RENDER_PARAMS.tipRadiusRatio) : 1));
  expect(root.children.filter(c => c instanceof InstancedMesh)).toEqual([bones]);
  expect(bones.geometry.parameters).toMatchObject({radialSegments:5, heightSegments:1, radiusTop:1, radiusBottom:1});
  expect(Array.from(bones.geometry.getAttribute('aPinchGlow').array)).toEqual(Array(15).fill(0));
  avatar.sync({...state,pressed:true},.01,()=>new Vector3(0,0,2));
  expect(root.children.slice(2).filter((c)=>c.visible)).toHaveLength(8);
  expect(Array.from(bones.geometry.getAttribute('aPinchGlow').array)).toEqual(Array.from({length:15}, (_,i)=>i===2||i===5?1:0));
  avatar.sync({...state,pressed:true},.81,()=>new Vector3(0,0,2));
  expect(root.children.slice(2).every((c)=>!c.visible)).toBe(true);
  avatar.sync({...state,visible:false,opacity:0},.1,()=>new Vector3()); expect(root.visible).toBe(false);
  avatar.dispose(); expect(scene.children).toHaveLength(0);
});

it('extends both bone ends by one chunky radius to overlap adjacent segments', async () => {
  const { handRadii } = await import('../../../src/render/hand/hand-transforms');
  const points = [new Vector3(), new Vector3(1,2,3), new Vector3(1,3,3)];
  const radii = handRadii(points,[[1,2]]);
  radii.forEach(radius => { expect(radius).toBeCloseTo(.42); });
  const radius = radii[0], extension = radius * HAND_RENDER_PARAMS.endExtension;
  const matrix = boneTransform(points[1],points[2],radius,extension);
  expect(new Vector3(0,-.5,0).applyMatrix4(matrix).distanceTo(points[1].clone().add(new Vector3(0,-radius,0)))).toBeLessThan(1e-12);
  expect(new Vector3(0,.5,0).applyMatrix4(matrix).distanceTo(points[2].clone().add(new Vector3(0,radius,0)))).toBeLessThan(1e-12);
});

it('uses the proximal segment length for all three radii of each finger despite unequal lengths', async () => {
  const { handRadii } = await import('../../../src/render/hand/hand-transforms');
  const points = Array.from({length:21}, () => new Vector3());
  const edges: number[][] = [];
  for (let finger=0; finger<5; finger++) {
    const base=1+finger*4;
    [0,2,3,3.5].forEach((y,i)=>points[base+i].set(finger,y,0));
    edges.push([base,base+1],[base+1,base+2],[base+2,base+3]);
  }
  const radii=handRadii(points,edges);
  for (let finger=0; finger<5; finger++) {
    const expected=2*(finger===0?HAND_RENDER_PARAMS.thumbRadiusRatio:HAND_RENDER_PARAMS.boneRadiusRatio);
    expect(radii.slice(finger*3,finger*3+3)).toEqual([expected,expected,expected]);
  }
});
