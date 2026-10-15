import { HAND_RENDER_PARAMS as p } from '../../config/params';
import { Matrix4, Quaternion, Vector3 } from 'three';
export const MODEL_HANDEDNESS = 'left' as const;
export const ROOT_BONE='Hand_L_04';
export const FINGER_BONES=[
  ['Hand_L_04','ThumbB_L_05','ThumbT_L_06','ThumbH_L_07'],
  ['IndexB_L_020','IndexM_L_021','IndexT_L_022','IndexH_L_023'],
  ['MiddleB_L_08','MiddleM_L_09','MiddleT_L_010','MiddleH_L_011'],
  ['RingB_L_012','RingM_L_013','RingT_L_014','RingH_L_015'],
  ['PinkyB_L_016','PinkyM_L_017','PinkyT_L_018','PinkyH_L_019'],
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

export interface RigBone {name:string;parent:number;position:Vector3;rotation:Quaternion;scale:Vector3}
export interface NativeRig {bones:readonly RigBone[];parentMatrix:Matrix4;restWorld:readonly Matrix4[];landmarks:readonly Vector3[]}
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
export function makeNativeRig(bones:readonly RigBone[],parentMatrix:Matrix4):NativeRig {
  [ROOT_BONE,...FINGER_BONES.flat()].forEach(name=>boneIndex(bones,name));
  const restWorld=boneWorldMatrices(bones,bones.map(b=>b.rotation),parentMatrix);
  const landmarks=[ROOT_BONE,...FINGER_BONES.flat()].map(name=>new Vector3().setFromMatrixPosition(restWorld[boneIndex(bones,name)]));
  return {bones,parentMatrix,restWorld,landmarks};
}
/** Palm/metacarpals retain their authored relative rotations. */
function palmRotations(rig:NativeRig,points:readonly Vector3[]):Quaternion[] {
  const rotations=rig.bones.map(b=>b.rotation.clone());
  const root=boneIndex(rig.bones,ROOT_BONE);
  const parent=rig.bones[root].parent;
  const parentRotation=new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(parent<0?rig.parentMatrix:rig.restWorld[parent]));
  const delta=frameRotation(points).multiply(frameRotation(rig.landmarks).invert());
  rotations[root]=parentRotation.clone().invert().multiply(delta).multiply(parentRotation).multiply(rotations[root]);
  return rotations;
}
export function pinchAssistWeight(points:readonly Vector3[]):number {
  const palm=points[0].distanceTo(points[9]);
  if(palm<1e-12) return 0;
  const ratio=points[4].distanceTo(points[8])/palm;
  return Math.max(0,Math.min(1,(p.pinchAssistFar-ratio)/(p.pinchAssistFar-p.pinchAssistNear)));
}
/** Parent-space swing only. Translations/scales and palm/metacarpal rotations stay authored. */
export function solveRotations(rig:NativeRig,points:readonly Vector3[]):Quaternion[] {
  const rotations=palmRotations(rig,points);
  for(let f=0;f<5;f++) for(let segment=0;segment<3;segment++) {
    if(FINGER_BONES[f][segment]===ROOT_BONE) continue;
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
  const weight=pinchAssistWeight(points);
  if(weight>0) {
    const initial=actualLandmarks(rig,boneWorldMatrices(rig.bones,rotations,rig.parentMatrix));
    const scale=rig.landmarks[0].distanceTo(rig.landmarks[9])/points[0].distanceTo(points[9]);
    const offset=points[4].clone().sub(points[8]).multiplyScalar(scale);
    // Alternate distal-to-proximal sweeps. Targets use the other finger's current
    // tip, blended against this finger's original tip so w=0 stays unassisted.
    for(let iteration=0;iteration<p.pinchAssistIterations;iteration++) for(const finger of [0,1]) {
      const current=actualLandmarks(rig,boneWorldMatrices(rig.bones,rotations,rig.parentMatrix));
      const tipId=finger===0?4:8,otherId=finger===0?8:4;
      const desired=current[otherId].clone().addScaledVector(offset,finger===0?1:-1);
      const target=initial[tipId].clone().lerp(desired,weight);
      for(const segment of finger===0?[2,1]:[2,1,0]) {
        const index=boneIndex(rig.bones,FINGER_BONES[finger][segment]),bone=rig.bones[index];
        const worlds=boneWorldMatrices(rig.bones,rotations,rig.parentMatrix);
        const pivot=new Vector3().setFromMatrixPosition(worlds[index]);
        const tip=new Vector3().setFromMatrixPosition(worlds[boneIndex(rig.bones,FINGER_BONES[finger][3])]);
        const from=tip.sub(pivot),to=target.clone().sub(pivot);
        if(from.lengthSq()<1e-12||to.lengthSq()<1e-12) continue;
        const inverse=(bone.parent<0?rig.parentMatrix:worlds[bone.parent]).clone().invert();
        from.transformDirection(inverse);to.transformDirection(inverse);
        rotations[index].premultiply(new Quaternion().setFromUnitVectors(from,to)).normalize();
      }
    }
  }
  return rotations;
}
export function actualLandmarks(rig:NativeRig,worlds:readonly Matrix4[]):Vector3[] {
  return [ROOT_BONE,...FINGER_BONES.flat()].map(name=>new Vector3().setFromMatrixPosition(worlds[boneIndex(rig.bones,name)]));
}
/** HandProvider already applies the fixed first-person transform (-x,-y,+z).
 * Never infer a hand label or flip depth from a palm normal: turning a hand over
 * changes that normal without changing which hand the user is holding up.
 */
export function firstPersonLandmarks(points:readonly Vector3[]):Vector3[] {
  return points.map(point=>point.clone());
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
      if(finger[k]===ROOT_BONE) {
        targets.push(new Vector3().setFromMatrixPosition(palmWorld[boneIndex(rig.bones,finger[k+1])]));
        continue;
      }
      const direction=points[id+1].clone().sub(points[id]);
      if(direction.lengthSq()<1e-12) direction.copy(rig.landmarks[id+1]).sub(rig.landmarks[id]);
      targets.push(targets[id].clone().addScaledVector(direction.normalize(),rig.landmarks[id].distanceTo(rig.landmarks[id+1])));
    }
  });
  return targets;
}
export function drivePose(rig:NativeRig,input:readonly Vector3[],target:Vector3,mirror:boolean) {
  const points=firstPersonLandmarks(input);
  const orientation=mirror?frameRotation(points):new Quaternion();
  const inverse=orientation.clone().invert(),origin=points[0];
  // Reflection in across becomes local X reflection in this outer frame.
  const drivePoints=points.map(p=>{const v=p.clone().sub(origin).applyQuaternion(inverse);if(mirror)v.x=-v.x;return v;});
  const rotations=solveRotations(rig,drivePoints),worlds=boneWorldMatrices(rig.bones,rotations,rig.parentMatrix);
  const landmarks=actualLandmarks(rig,worlds);
  const targets=retargetLandmarks(rig,drivePoints);
  const scale=points[0].distanceTo(points[9])/rig.landmarks[0].distanceTo(rig.landmarks[9]);
  const placement=new Matrix4().compose(new Vector3(),orientation,new Vector3(mirror?-scale:scale,scale,scale));
  const midpoint=landmarks[4].clone().add(landmarks[8]).multiplyScalar(.5).applyMatrix4(placement);
  placement.setPosition(target.clone().sub(midpoint));
  return {rotations,placement,landmarks:landmarks.map(v=>v.applyMatrix4(placement)),targets:targets.map(v=>v.applyMatrix4(placement))};
}
