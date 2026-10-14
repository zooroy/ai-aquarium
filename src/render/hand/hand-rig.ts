import { Color, Matrix4, Vector3 } from 'three';
import { HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
export interface HandFrameAxes { across: Vector3; up: Vector3; normal: Vector3 }
export function handFrame(joints: readonly Vector3[]): HandFrameAxes {
  const across=joints[17].clone().sub(joints[5]).normalize();
  if(across.lengthSq()<1e-12) across.set(1,0,0);
  const up=joints[9].clone().sub(joints[0]); up.addScaledVector(across,-up.dot(across));
  if(up.lengthSq()<1e-12) {up.set(0,1,0);if(Math.abs(up.dot(across))>.9) up.set(0,0,1);up.addScaledVector(across,-up.dot(across));}
  up.normalize();return {across,up,normal:across.clone().cross(up).normalize()};
}
/** After input mirroring: thumb on screen right and palm toward camera => right hand. */
export function handedness(joints: readonly Vector3[]): 'left'|'right' { return handFrame(joints).normal.z<0?'right':'left'; }
export function boneSegments(fallback: readonly number[]=[]): [number,number][] {
  return [[0,9],...Array.from({length:5},(_,f): [number,number][]=> {
    const base=1+4*f;
    return fallback.includes(f)?[[base,base+1],[base+1,base+3]]:[[base,base+1],[base+1,base+2],[base+2,base+3]];
  }).flat()];
}
function segmentFrame(joints: readonly Vector3[],a:number,b:number): Matrix4 {
  const {normal,across}=handFrame(joints), y=joints[b].clone().sub(joints[a]).normalize();
  if(y.lengthSq()<1e-12) y.set(0,1,0);
  let x=y.clone().cross(normal);
  if(x.lengthSq()<1e-10) x=across.clone().addScaledVector(y,-across.dot(y));
  x.normalize();const z=x.clone().cross(y).normalize();
  return new Matrix4().makeBasis(x,y,z).setPosition(joints[a]);
}
export function restBoneFrames(joints: readonly Vector3[],fallback: readonly number[]=[]): Matrix4[] {
  return boneSegments(fallback).map(([a,b])=>segmentFrame(joints,a,b));
}
export function drivenBoneFrames(rest: readonly Vector3[],current: readonly Vector3[],fallback: readonly number[]=[]): Matrix4[] {
  const scale=current[0].distanceTo(current[9])/Math.max(rest[0].distanceTo(rest[9]),1e-9);
  return boneSegments(fallback).map(([a,b])=>segmentFrame(current,a,b).scale(new Vector3(scale,
    current[a].distanceTo(current[b])/Math.max(rest[a].distanceTo(rest[b]),1e-9),scale)));
}
const PALM_JOINTS = [0, 1, 5, 9, 13, 17] as const;
/**
 * Re-targets tracked joints onto the model's own proportions so the mesh keeps its exact shape:
 * the palm moves rigidly (rotation + uniform scale), and each finger segment keeps its rest length,
 * only following the tracked direction (forward kinematics from the palm outward).
 */
export function articulateJoints(rest: readonly Vector3[], current: readonly Vector3[]): Vector3[] {
  const from = handFrame(rest), to = handFrame(current);
  const rotation = new Matrix4().makeBasis(to.across, to.up, to.normal)
    .multiply(new Matrix4().makeBasis(from.across, from.up, from.normal).transpose());
  const scale = current[0].distanceTo(current[9]) / Math.max(rest[0].distanceTo(rest[9]), 1e-9);
  const place = (point: Vector3) => point.clone().sub(rest[0]).applyMatrix4(rotation).multiplyScalar(scale).add(current[0]);
  const joints = rest.map((point) => point.clone());
  for (const id of PALM_JOINTS) joints[id] = place(rest[id]);
  for (let finger = 0; finger < 5; finger++) {
    const base = 1 + finger * 4;
    for (let id = base + 1; id <= base + 3; id++) {
      const direction = current[id].clone().sub(current[id - 1]);
      // Degenerate tracking keeps the rest direction carried by the palm rotation.
      if (direction.lengthSq() < 1e-12) direction.copy(rest[id].clone().sub(rest[id - 1]).applyMatrix4(rotation));
      joints[id] = joints[id - 1].clone().addScaledVector(direction.normalize(), rest[id].distanceTo(rest[id - 1]) * scale);
    }
  }
  return joints;
}
export function deformationMatrices(rest: readonly Vector3[],current: readonly Vector3[],fallback: readonly number[]=[]): Matrix4[] {
  const bind=restBoneFrames(rest,fallback);
  return drivenBoneFrames(rest,current,fallback).map((matrix,i)=>matrix.multiply(bind[i].invert()));
}
function segmentDistance(point: Vector3,a: Vector3,b: Vector3): number {
  const d=b.clone().sub(a),t=Math.max(0,Math.min(1,point.clone().sub(a).dot(d)/Math.max(d.lengthSq(),1e-12)));
  return point.distanceTo(a.clone().addScaledVector(d,t));
}
export function skinWeights(positions: ArrayLike<number>,rest: readonly Vector3[],fallback: readonly number[]=[]): {indices:Uint16Array; weights:Float32Array} {
  const segments=boneSegments(fallback), indices=new Uint16Array(positions.length/3*4),weights=new Float32Array(indices.length);
  const frame=handFrame(rest);
  const roots=[5,9,13,17].map(id=>({x:rest[id].dot(frame.across),y:rest[id].dot(frame.up)}));
  const thumbX=rest[1].dot(frame.across),thumbY=rest[1].dot(frame.up);
  const thumbDirection=rest[2].clone().sub(rest[1]);
  for(let v=0;v<positions.length/3;v++) {
    // Weld-equivalent locations receive identical weights even at split triangle seams.
    const point=new Vector3(...[0,1,2].map(k=>Math.round(positions[v*3+k]*1e7)/1e7) as [number,number,number]);
    const x=point.dot(frame.across),y=point.dot(frame.up);
    let top=roots[x<roots[0].x?0:3].y;
    for(let r=0;r<3;r++) if(x>=roots[r].x&&x<=roots[r+1].x) {
      const t=(x-roots[r].x)/Math.max(roots[r+1].x-roots[r].x,1e-9);
      top=roots[r].y+(roots[r+1].y-roots[r].y)*t;
    }
    // A spatial palm mask takes precedence over nearest-segment distance.
    // In particular, neither wrist corner may be pulled by the thumb.
    if(y<=top && (x>=thumbX || y<=thumbY)) {
      weights[v*4]=1;continue;
    }
    const thumbT=point.clone().sub(rest[1]).dot(thumbDirection)/thumbDirection.lengthSq();
    if(y<=top && x<thumbX && thumbT<=1) {
      const amount=Math.max(0,Math.min(1,thumbT));
      const thumbWeight=amount*amount*(3-2*amount);
      const thumbFirst=thumbWeight>.5;
      indices[v*4]=thumbFirst?1:0;indices[v*4+1]=thumbFirst?0:1;
      weights[v*4]=thumbFirst?thumbWeight:1-thumbWeight;weights[v*4+1]=1-weights[v*4];continue;
    }
    const distances=segments.map(([a,b],i)=>({i,d:segmentDistance(point,rest[a],rest[b])})).sort((a,b)=>a.d-b.d);
    const first=distances[0]; const [a,b]=segments[first.i];
    const adjacent=distances.find(other=>other.i!==first.i&&(
      segments[other.i].some(id=>id===a||id===b)
      || (first.i===0 && (segments[other.i][0]-1)%4===0)
      || (other.i===0 && (a-1)%4===0)));
    let blend=0;
    if(adjacent) {
      const length=rest[a].distanceTo(rest[b]);
      blend=.5*Math.max(0,1-(adjacent.d-first.d)/Math.max(length*p.skinBlend,1e-9));
    }
    indices[v*4]=first.i;indices[v*4+1]=adjacent?.i??first.i;
    weights[v*4]=1-blend;weights[v*4+1]=blend;
  }
  return {indices,weights};
}
export function writeRigColors(colors: Float32Array,indices: Uint16Array,weights: Float32Array,pressed:boolean,fallback:readonly number[]=[]): void {
  const segments=boneSegments(fallback),base=new Color(PALETTE.hand.base),glow=new Color(PALETTE.hand.glow);
  for(let v=0;v<colors.length/3;v++) {
    let amount=0;
    if(pressed) for(let k=0;k<4;k++) if([4,8].includes(segments[indices[v*4+k]][1])) amount+=weights[v*4+k];
    const color=base.clone().lerp(glow,amount);colors.set([color.r,color.g,color.b],v*3);
  }
}
