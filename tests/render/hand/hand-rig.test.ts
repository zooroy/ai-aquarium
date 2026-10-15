import { Matrix4, Quaternion, Vector3 } from 'three';
import { expect,it } from 'vitest';
import { ROOT_BONE,FINGER_BONES,pinchAssistWeight,solveRotations,boneWorldMatrices,boneIndex,drivePose,actualLandmarks } from '../../../src/render/hand/hand-rig';
import { createReplaySource,getReplayScript } from '../../../src/input/hand/replay-source';
import { readNativeFixture } from './glb-fixture';
const fixture=readNativeFixture(),rig=fixture.rig;
it('matches every specified name and authored glove hierarchy',()=>{
  for(const name of [ROOT_BONE,...FINGER_BONES.flat()]) expect(fixture.json.nodes.some(n=>n.name===name)).toBe(true);
  expect(rig.bones).toHaveLength(fixture.json.skins[0].joints.length);expect(rig.landmarks).toHaveLength(21);
  for(const finger of FINGER_BONES) for(let i=1;i<4;i++) expect(rig.bones[boneIndex(rig.bones,finger[i])].parent).toBe(boneIndex(rig.bones,finger[i-1]));
});
it('keeps all authored rotations in model rest pose',()=>{
  const result=solveRotations(rig,rig.landmarks);
  result.forEach((q,i)=>expect(q.clone().normalize().angleTo(rig.bones[i].rotation.clone().normalize())).toBeLessThan(1e-6));
});
it('changes only swing rotations, preserving all bone lengths and following requested directions',()=>{
  const replay=createReplaySource(getReplayScript('demo'));
  for(const time of [0,3000,5000,8000]) {
    const current=replay.frameAt(time)!.worldLandmarks.map(p=>new Vector3(p.x,-p.y,p.z));
    const rotations=solveRotations(rig,current),worlds=boneWorldMatrices(rig.bones,rotations,rig.parentMatrix),actual=actualLandmarks(rig,worlds);
    for(let i=0;i<rig.bones.length;i++) {
      const parent=rig.bones[i].parent;if(parent<0) continue;
      const distance=(m:readonly Matrix4[])=>new Vector3().setFromMatrixPosition(m[i]).distanceTo(new Vector3().setFromMatrixPosition(m[parent]));
      expect(distance(worlds)).toBeCloseTo(distance(rig.restWorld),5);
    }
    const driven=new Set<string>(FINGER_BONES.flatMap(f=>f.slice(0,3)).filter(name=>name!==ROOT_BONE));
    rig.bones.forEach((bone,i)=>{
      if(bone.name!==ROOT_BONE&&!driven.has(bone.name)) expect(rotations[i].clone().normalize().angleTo(bone.rotation.clone().normalize())).toBeLessThan(1e-6);
    });
    // CMC follows the palm root, with no additional finger swing.
    const palmOnly=solveRotations(rig,current.map((point,i)=>i===2?point.clone().add(new Vector3(1,2,3)):point));
    expect(palmOnly[boneIndex(rig.bones,ROOT_BONE)]).toEqual(rotations[boneIndex(rig.bones,ROOT_BONE)]);
    for(let f=0;f<5;f++) for(let k=0;k<3;k++) {
      if(FINGER_BONES[f][k]===ROOT_BONE || (f<=1&&pinchAssistWeight(current)>0)) continue;
      const i=1+f*4+k;
      expect(actual[i+1].clone().sub(actual[i]).normalize().dot(current[i+1].clone().sub(current[i]).normalize())).toBeGreaterThan(.99999);
    }
  }
});
it('mirrors with negative determinant while aligning actual fingertips and preserving model proportions',()=>{
  const frame=createReplaySource(getReplayScript('demo')).frameAt(5000)!;
  for(const left of [false,true]) {
    const points=frame.worldLandmarks.map(p=>new Vector3(left?p.x:-p.x,-p.y,p.z));
    const target=new Vector3(2,3,2.5),result=drivePose(rig,points,target,left);
    expect(Math.sign(result.placement.determinant())).toBe(left?-1:1);
    expect(result.landmarks[4].clone().add(result.landmarks[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-10);
    const scale=new Vector3(),q=new Quaternion(),position=new Vector3();result.placement.decompose(position,q,scale);
    expect(Math.abs(scale.x)).toBeCloseTo(scale.y);expect(scale.y).toBeCloseTo(scale.z);
    for(let f=0;f<5;f++)for(let k=0;k<3;k++) {
      const id=1+f*4+k;
      expect(result.landmarks[id+1].distanceTo(result.landmarks[id])).toBeCloseTo(rig.landmarks[id+1].distanceTo(rig.landmarks[id])*scale.y,5);
    }
  }
});
it.each([1000,5000])('aligns retargeted targets and bends first-person pinch tips away from the camera at %sms, including mirrored hands',async(time)=>{
  const {handFrame,firstPersonLandmarks}=await import('../../../src/render/hand/hand-rig');
  const frame=createReplaySource(getReplayScript('demo')).frameAt(time)!;
  for(const mirror of [false,true]) {
    // Same coordinate conversion as HandProvider: x/y mirrored, z still MediaPipe depth.
    const points=frame.worldLandmarks.map(p=>new Vector3(mirror?p.x:-p.x,-p.y,p.z));
    const original=points.map(p=>p.clone()),target=new Vector3(.4,-.2,2.5);
    const result=drivePose(rig,points,target,!mirror),palmLength=points[0].distanceTo(points[9]);
    result.landmarks.forEach((point,i)=>{if(i>=2&&i<=8&&pinchAssistWeight(points)>0)return;expect(point.distanceTo(result.targets[i])).toBeLessThan(palmLength*.05);});
    expect(handFrame(result.landmarks).normal.dot(handFrame(firstPersonLandmarks(points)).normal)).toBeGreaterThan(.9);
    expect(result.landmarks[4].clone().add(result.landmarks[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-10);
    // Check direction and length independently of the solved rotations and the debug points.
    const corrected=firstPersonLandmarks(points);
    const scale=palmLength/rig.landmarks[0].distanceTo(rig.landmarks[9]);
    for(let f=0;f<5;f++) for(let k=0;k<3;k++) {
      const id=1+4*f+k,direction=result.targets[id+1].clone().sub(result.targets[id]);
      expect(direction.length()).toBeCloseTo(rig.landmarks[id+1].distanceTo(rig.landmarks[id])*scale,6);
      if(FINGER_BONES[f][k]!==ROOT_BONE) expect(direction.normalize().dot(corrected[id+1].clone().sub(corrected[id]).normalize())).toBeGreaterThan(.99999);
    }
    if(time===5000) {
      const palmCenter=[0,5,9,13,17].reduce((sum,i)=>sum.add(result.landmarks[i]),new Vector3()).divideScalar(5);
      expect(result.landmarks[4].z).toBeLessThan(palmCenter.z);
      expect(result.landmarks[8].z).toBeLessThan(palmCenter.z);
      expect(result.landmarks[4].distanceTo(result.landmarks[8])).toBeLessThan(palmLength*.25);
    }
    expect(points).toEqual(original);
  }
});
it('shows the back of the right hand with thumb on the left, mirroring only the left hand',async()=>{
  const {firstPersonLandmarks,handFrame}=await import('../../../src/render/hand/hand-rig');
  const frame=createReplaySource(getReplayScript('demo')).frameAt(1000)!;
  for(const left of [false,true]) for(const back of [false,true]) {
    const input=frame.worldLandmarks.map(p=>new Vector3((left?p.x:-p.x)*(back?-1:1),-p.y,p.z*(back?-1:1)));
    const shape=firstPersonLandmarks(input);
    expect(shape).toEqual(input);
    const target=new Vector3(.4,.1,2.5),driven=drivePose(rig,input,target,!left);
    expect(Math.sign(driven.placement.determinant())).toBe(left?1:-1);
    const thumbSide=driven.landmarks[4].x-driven.landmarks[9].x;
    expect(left!==back?thumbSide:-thumbSide).toBeGreaterThan(0);
    const worlds=boneWorldMatrices(rig.bones,driven.rotations,rig.parentMatrix);
    const root=boneIndex(rig.bones,ROOT_BONE);
    // Anatomical dorsal normal in the authored right-hand frame, transformed
    // as a surface normal (not the cross-product pseudovector after mirroring).
    const deformation=driven.placement.clone().multiply(worlds[root]).multiply(rig.restWorld[root].clone().invert());
    const {Matrix3}=await import('three');
    const backNormal=handFrame(rig.landmarks).normal.negate().applyMatrix3(new Matrix3().getNormalMatrix(deformation)).normalize();
    expect(backNormal.z*(back?-1:1)).toBeGreaterThan(.9);
    const moved=drivePose(rig,input,new Vector3(target.x+1,target.y,target.z),!left);
    driven.landmarks.forEach((point,i)=>expect(moved.landmarks[i].clone().sub(point).distanceTo(new Vector3(1,0,0))).toBeLessThan(1e-10));
    expect(driven.landmarks[4].clone().add(driven.landmarks[8]).multiplyScalar(.5).distanceTo(target)).toBeLessThan(1e-10);
  }
});

it('uses the authored T to H distance as each terminal segment length',()=>{
  for(let finger=0;finger<5;finger++) {
    const t=rig.restWorld[boneIndex(rig.bones,FINGER_BONES[finger][2])];
    const h=rig.restWorld[boneIndex(rig.bones,FINGER_BONES[finger][3])];
    const distance=new Vector3().setFromMatrixPosition(t).distanceTo(new Vector3().setFromMatrixPosition(h));
    expect(rig.landmarks[3+finger*4].distanceTo(rig.landmarks[4+finger*4])).toBeCloseTo(distance,12);
  }
});

it('keeps open-hand thumb directions aligned with zero assistance',()=>{
  const points=rig.landmarks.map(v=>v.clone());
  expect(pinchAssistWeight(points)).toBe(0);
  const actual=actualLandmarks(rig,boneWorldMatrices(rig.bones,solveRotations(rig,points),rig.parentMatrix));
  for(const i of [2,3]) expect(actual[i+1].clone().sub(actual[i]).normalize().dot(points[i+1].clone().sub(points[i]).normalize())).toBeGreaterThan(.99999);
});
it('assisted pinch preserves all authored bone offsets, scales and segment lengths',()=>{
  const points=createReplaySource(getReplayScript('demo')).frameAt(5000)!.worldLandmarks.map(p=>new Vector3(-p.x,-p.y,p.z));
  expect(pinchAssistWeight(points)).toBeGreaterThan(0);
  const offsets=rig.bones.map(b=>b.position.clone()),scales=rig.bones.map(b=>b.scale.clone());
  const rotations=solveRotations(rig,points),worlds=boneWorldMatrices(rig.bones,rotations,rig.parentMatrix);
  rig.bones.forEach((b,i)=>{
    expect(b.position).toEqual(offsets[i]);expect(b.scale).toEqual(scales[i]);
    if(b.parent>=0) {
      const distance=(m:readonly Matrix4[])=>new Vector3().setFromMatrixPosition(m[i]).distanceTo(new Vector3().setFromMatrixPosition(m[b.parent]));
      expect(distance(worlds)).toBeCloseTo(distance(rig.restWorld),6);
    }
  });
});
