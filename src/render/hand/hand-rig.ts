import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { HAND_RENDER_PARAMS } from '../../config/params';
import { PALETTE } from '../../config/palette';
export const ROOT_BONE='GLTF_created_0_rootJoint';
export const PALM_BONES=['Bone_18','Bone.001_5','Bone.002_9','Bone.003_13','Bone.004_17'] as const;
export const FINGER_BONES=[
  ['Bone.017_21','Bone.018_20','Bone.019_19'],
  ['Bone.005_4','Bone.006_3','Bone.007_2'],
  ['Bone.008_8','Bone.009_7','Bone.010_6'],
  ['Bone.011_12','Bone.012_11','Bone.013_10'],
  ['Bone.014_16','Bone.015_15','Bone.016_14'],
] as const;
/** GLTFLoader sanitizes dots for animation property binding. */
export function loadedBoneName(name:string):string {return name.replaceAll('.','');}
export interface HandFrameAxes {across:Vector3;up:Vector3;normal:Vector3}
export function handFrame(joints:readonly Vector3[]):HandFrameAxes {
  const across=joints[17].clone().sub(joints[5]).normalize();if(across.lengthSq()<1e-12) across.set(1,0,0);
  const up=joints[9].clone().sub(joints[0]);up.addScaledVector(across,-up.dot(across));
  if(up.lengthSq()<1e-12) {up.set(0,1,0);if(Math.abs(up.dot(across))>.9) up.set(0,0,1);up.addScaledVector(across,-up.dot(across));}
  up.normalize();return {across,up,normal:across.clone().cross(up).normalize()};
}
function frameRotation(points:readonly Vector3[]):Quaternion {
  const {across,up,normal}=handFrame(points);return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across,up,normal));
}
export function handedness(points:readonly Vector3[]):'left'|'right' {return handFrame(points).normal.z>=0?'right':'left';}
export interface RigBone {name:string;parent:number;position:Vector3;rotation:Quaternion;scale:Vector3}
export interface NativeRig {bones:readonly RigBone[];parentMatrix:Matrix4;restWorld:readonly Matrix4[];landmarks:readonly Vector3[];tipLocal:readonly Vector3[]}
export function boneWorldMatrices(bones:readonly RigBone[],rotations:readonly Quaternion[],parentMatrix=new Matrix4()):Matrix4[] {
  const world:Matrix4[]=[];
  const visit=(i:number):Matrix4=> {
    if(world[i]) return world[i];const bone=bones[i];
    const parent=bone.parent<0?parentMatrix:visit(bone.parent);
    return world[i]=parent.clone().multiply(new Matrix4().compose(bone.position,rotations[i],bone.scale));
  };
  bones.forEach((_,i)=>visit(i));return world;
}
export function boneIndex(bones:readonly RigBone[],name:string):number {
  const index=bones.findIndex(b=>loadedBoneName(b.name)===loadedBoneName(name));
  if(index<0) throw Error(`Missing hand bone: ${name}`);return index;
}
/** Terminal cap centroid, restricted to vertices influenced by that terminal bone. */
export function estimateTip(vertices:readonly Vector3[],weights:ArrayLike<number>,indices:ArrayLike<number>,bone:number,origin:Vector3,direction:Vector3):Vector3 {
  const candidates=vertices.filter((_,v)=>[0,1,2,3].some(k=>indices[v*4+k]===bone&&weights[v*4+k]>0));
  if(!candidates.length) throw Error(`No tip vertices for bone ${bone}`);
  const distances=candidates.map(v=>v.clone().sub(origin).dot(direction));
  const max=Math.max(...distances),min=Math.min(...distances),tolerance=Math.max(1e-6,(max-min)*HAND_RENDER_PARAMS.tipCapRatio);
  const cap=candidates.filter((_,i)=>distances[i]>=max-tolerance);
  return cap.reduce((sum,v)=>sum.add(v),new Vector3()).divideScalar(cap.length);
}
export function makeNativeRig(bones:readonly RigBone[],parentMatrix:Matrix4,vertices:readonly Vector3[],indices:ArrayLike<number>,weights:ArrayLike<number>):NativeRig {
  [...PALM_BONES,ROOT_BONE,...FINGER_BONES.flat()].forEach(name=>boneIndex(bones,name));
  const restWorld=boneWorldMatrices(bones,bones.map(b=>b.rotation),parentMatrix);
  const landmarks=[new Vector3().setFromMatrixPosition(restWorld[boneIndex(bones,ROOT_BONE)])],tipLocal:Vector3[]=[];
  for(const finger of FINGER_BONES) {
    for(const name of finger) landmarks.push(new Vector3().setFromMatrixPosition(restWorld[boneIndex(bones,name)]));
    const index=boneIndex(bones,finger[2]),matrix=restWorld[index];
    const origin=new Vector3().setFromMatrixPosition(matrix),direction=new Vector3(0,1,0).transformDirection(matrix);
    const tip=estimateTip(vertices,weights,indices,index,origin,direction);
    landmarks.push(tip);tipLocal.push(tip.clone().applyMatrix4(matrix.clone().invert()));
  }
  return {bones,parentMatrix,restWorld,landmarks,tipLocal};
}
/** Palm/metacarpals retain their authored relative rotations. */
function palmRotations(rig:NativeRig,points:readonly Vector3[]):Quaternion[] {
  const rotations=rig.bones.map(b=>b.rotation.clone());
  const root=boneIndex(rig.bones,ROOT_BONE),parentRotation=new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(rig.parentMatrix));
  const delta=frameRotation(points).multiply(frameRotation(rig.landmarks).invert());
  rotations[root]=parentRotation.clone().invert().multiply(delta).multiply(parentRotation).multiply(rotations[root]);
  return rotations;
}
/** Parent-space swing only. Translations/scales and palm/metacarpal rotations stay authored. */
export function solveRotations(rig:NativeRig,points:readonly Vector3[]):Quaternion[] {
  const rotations=palmRotations(rig,points);
  for(let f=0;f<5;f++) for(let segment=0;segment<3;segment++) {
    const index=boneIndex(rig.bones,FINGER_BONES[f][segment]),bone=rig.bones[index],id=1+f*4+segment;
    const worlds=boneWorldMatrices(rig.bones,rotations,rig.parentMatrix);
    const currentParent=bone.parent<0?rig.parentMatrix:worlds[bone.parent];
    const restParent=bone.parent<0?rig.parentMatrix:rig.restWorld[bone.parent];
    const restDirection=rig.landmarks[id+1].clone().sub(rig.landmarks[id]).transformDirection(restParent.clone().invert());
    const direction=points[id+1].clone().sub(points[id]);
    if(direction.lengthSq()<1e-12) continue;
    direction.transformDirection(currentParent.clone().invert());
    rotations[index]=new Quaternion().setFromUnitVectors(restDirection,direction).multiply(bone.rotation);
  }
  return rotations;
}
export function actualLandmarks(rig:NativeRig,worlds:readonly Matrix4[]):Vector3[] {
  const result=[new Vector3().setFromMatrixPosition(worlds[boneIndex(rig.bones,ROOT_BONE)])];
  FINGER_BONES.forEach((finger,f)=>{
    finger.forEach(name=>result.push(new Vector3().setFromMatrixPosition(worlds[boneIndex(rig.bones,name)])));
    result.push(rig.tipLocal[f].clone().applyMatrix4(worlds[boneIndex(rig.bones,finger[2])]));
  });return result;
}
/** MediaPipe depth is negative toward the camera; scene depth is positive toward it.
 * Reflect relative to the wrist, preserving the input translation and all lengths.
 */
export function cameraFacingLandmarks(points:readonly Vector3[]):Vector3[] {
  return points.map(point=>new Vector3(point.x,point.y,2*points[0].z-point.z));
}
/** Independent forward construction: rigid model roots + observed segment directions
 * at authored lengths. It does not read the solved finger transforms.
 */
export function retargetLandmarks(rig:NativeRig,points:readonly Vector3[]):Vector3[] {
  const palmWorld=boneWorldMatrices(rig.bones,palmRotations(rig,points),rig.parentMatrix);
  const targets=[new Vector3().setFromMatrixPosition(palmWorld[boneIndex(rig.bones,ROOT_BONE)])];
  FINGER_BONES.forEach((finger,f)=>{
    targets.push(new Vector3().setFromMatrixPosition(palmWorld[boneIndex(rig.bones,finger[0])]));
    for(let k=0;k<3;k++) {
      const id=1+f*4+k;
      const direction=points[id+1].clone().sub(points[id]);
      if(direction.lengthSq()<1e-12) direction.copy(rig.landmarks[id+1]).sub(rig.landmarks[id]);
      targets.push(targets[id].clone().addScaledVector(direction.normalize(),rig.landmarks[id].distanceTo(rig.landmarks[id+1])));
    }
  });
  return targets;
}
export function drivePose(rig:NativeRig,input:readonly Vector3[],target:Vector3,left=handedness(input)==='left') {
  const points=cameraFacingLandmarks(input);
  const orientation=left?frameRotation(points):new Quaternion();
  const inverse=orientation.clone().invert(),origin=points[0];
  // Reflection in across becomes local X reflection in this outer frame.
  const drivePoints=points.map(p=>{const v=p.clone().sub(origin).applyQuaternion(inverse);if(left)v.x=-v.x;return v;});
  const rotations=solveRotations(rig,drivePoints),worlds=boneWorldMatrices(rig.bones,rotations,rig.parentMatrix);
  const landmarks=actualLandmarks(rig,worlds);
  const targets=retargetLandmarks(rig,drivePoints);
  const scale=points[0].distanceTo(points[9])/rig.landmarks[0].distanceTo(rig.landmarks[9]);
  const placement=new Matrix4().compose(new Vector3(),orientation,new Vector3(left?-scale:scale,scale,scale));
  const midpoint=landmarks[4].clone().add(landmarks[8]).multiplyScalar(.5).applyMatrix4(placement);
  placement.setPosition(target.clone().sub(midpoint));
  return {rotations,placement,landmarks:landmarks.map(v=>v.applyMatrix4(placement)),targets:targets.map(v=>v.applyMatrix4(placement))};
}
export function writeNativeColors(colors:Float32Array,indices:ArrayLike<number>,weights:ArrayLike<number>,bones:readonly RigBone[],pressed:boolean):void {
  const tips=[boneIndex(bones,FINGER_BONES[0][2]),boneIndex(bones,FINGER_BONES[1][2])];
  const base=new Color(PALETTE.hand.base),glow=new Color(PALETTE.hand.glow);
  for(let v=0;v<colors.length/3;v++) {
    let amount=0;if(pressed) for(let k=0;k<4;k++) if(tips.includes(indices[v*4+k])) amount+=weights[v*4+k];
    const color=base.clone().lerp(glow,Math.min(1,amount));colors.set([color.r,color.g,color.b],v*3);
  }
}
