import { Color, Quaternion, Vector3 } from 'three';
import { HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';

export interface HandFrameAxes { across: Vector3; up: Vector3; normal: Vector3 }
function unit(v: Vector3, fallback: Vector3): Vector3 {
  return v.lengthSq() > 1e-12 ? v.normalize() : fallback.clone();
}
export function handFrame(joints: readonly Vector3[]): HandFrameAxes {
  const across = unit(joints[17].clone().sub(joints[5]), new Vector3(1,0,0));
  const rawUp = joints[9].clone().sub(joints[0]);
  const fallback = Math.abs(across.y) < .9 ? new Vector3(0,1,0) : new Vector3(0,0,1);
  const up = unit(rawUp.addScaledVector(across,-rawUp.dot(across)), fallback.addScaledVector(across,-fallback.dot(across)).normalize());
  return { across, up, normal: across.clone().cross(up).normalize() };
}
/** Palm roots lie on ordered, coplanar top/side edges, independent of finger bending. */
export function palmLayout(joints: readonly Vector3[], frame = handFrame(joints)) {
  const origin=joints[0];
  const roots=[5,9,13,17];
  const xs=roots.map(id=>joints[id].clone().sub(origin).dot(frame.across));
  const spacing=xs.slice(1).map((x,i)=>Math.max(0,x-xs[i]));
  const widths=roots.map((id,i)=>Math.min(joints[id].distanceTo(joints[id+1])*p.fingerWidth,
    Math.min(...spacing.slice(Math.max(0,i-1),Math.min(3,i+1)))*p.fingerGapRatio));
  const top=roots.reduce((sum,id)=>sum+joints[id].clone().sub(origin).dot(frame.up),0)/4;
  const left=xs[0]-widths[0]/2-(xs[3]-xs[0])*p.palmExpansion;
  const right=xs[3]+widths[3]/2;
  const thumbWidth=Math.min(joints[1].distanceTo(joints[2])*p.fingerWidth,top*p.fingerGapRatio);
  const thumbY=top/2;
  const at=(x:number,y:number)=>origin.clone().addScaledVector(frame.across,x).addScaledVector(frame.up,y);
  return { widths:[thumbWidth,...widths], thickness:Math.min(...widths)*p.fingerThickness,
    centers:[at(left,thumbY),...xs.map(x=>at(x,top))], wrist:[at(left,0),at(right,0)] };
}
/** Each joint ring is constructed once and reused by both adjacent segments. */
export function fingerRings(joints: readonly Vector3[], base: number, frame = handFrame(joints)): Vector3[][] {
  const length = joints[base].distanceTo(joints[base+1]);
  const layout=palmLayout(joints,frame), finger=(base-1)/4;
  const fingerWidth=layout.widths[finger];
  let previousWidth=base===1?frame.up.clone():frame.across.clone();
  let previousDirection=base===1?frame.across.clone().negate():frame.up.clone();
  return Array.from({length:4}, (_,i) => {
    const prev = unit(joints[base+i].clone().sub(joints[base+Math.max(0,i-1)]), frame.up);
    const next = i<3 ? unit(joints[base+i+1].clone().sub(joints[base+i]), prev) : prev;
    // Never stretch a miter at a sharp bend; use the shorter adjoining segment.
    const incomingLength=i>0?joints[base+i].distanceTo(joints[base+i-1]):Infinity;
    const outgoingLength=i<3?joints[base+i].distanceTo(joints[base+i+1]):Infinity;
    const direction = i===0 ? next : prev.angleTo(next)>p.maxMiterAngle
      ? (incomingLength<=outgoingLength?prev:next).clone() : unit(prev.clone().add(next),next);
    // Parallel transport avoids a width-axis sign jump near across in a pinch.
    let width=previousWidth.clone().applyQuaternion(new Quaternion().setFromUnitVectors(previousDirection,direction));
    width.addScaledVector(direction,-width.dot(direction));
    if(width.lengthSq()<p.widthAxisEpsilon*p.widthAxisEpsilon) width=frame.normal.clone().cross(direction);
    width.normalize();
    let depth=width.clone().cross(direction).normalize();
    if(i===0) { width=previousWidth.clone(); depth=frame.normal.clone(); }
    previousWidth=width.clone();
    previousDirection=i===0 ? previousDirection : direction.clone();
    const scale = i===3 ? p.tipScale : 1-p.fingerTaper*i;
    // Short folded phalanges cannot support a full-width section without overlap.
    const sectionWidth=i===0?fingerWidth:Math.min(fingerWidth,Math.min(incomingLength,outgoingLength)*p.shortSegmentWidth);
    const center = i===0 ? layout.centers[finger].clone() : joints[base+i].clone();
    if(i===0 && base!==1) center.addScaledVector(frame.up,-layout.thickness*p.rootInset);
    if (i===3) center.addScaledVector(direction,Math.min(length,incomingLength)*p.tipExtension);
    return [[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,z]) => center.clone()
      .addScaledVector(width,x*sectionWidth*scale/2)
      .addScaledVector(depth,z*(i===0?layout.thickness:sectionWidth*p.fingerThickness)*scale/2));
  });
}
// Five fingers: 3x8 side triangles + 2 cap triangles each. Palm: 48 bevel,
// 24 face-fan and 14 perimeter triangles; root openings have no internal caps.
export const HAND_TRIANGLES = 216;
export const HAND_VERTEX_COUNT = HAND_TRIANGLES*3;
const baseColor = new Color(PALETTE.hand.base), glowColor = new Color(PALETTE.hand.glow);
export function writeHandMesh(joints: readonly Vector3[], pressed: boolean, positions: Float32Array, colors: Float32Array): void {
  const frame = handFrame(joints);
  const fingers = [1,5,9,13,17].map(base => fingerRings(joints,base,frame));
  let offset=0;
  const tri = (a: Vector3,b: Vector3,c: Vector3,glow=false) => {
    const color=glow?glowColor:baseColor;
    for (const v of [a,b,c]) { positions.set([v.x,v.y,v.z],offset); colors.set([color.r,color.g,color.b],offset); offset+=3; }
  };
  const quad = (a: Vector3,b: Vector3,c: Vector3,d: Vector3,glow=false) => { tri(a,b,c,glow); tri(a,c,d,glow); };
  fingers.forEach((rings,f) => {
    for(let i=0;i<3;i++) for(let k=0;k<4;k++) {
      const n=(k+1)%4;
      quad(rings[i][k],rings[i][n],rings[i+1][n],rings[i+1][k],pressed&&f<2&&i===2);
    }
    quad(...rings[3] as [Vector3,Vector3,Vector3,Vector3],pressed&&f<2);
  });
  const layout=palmLayout(joints,frame), thickness=layout.thickness;
  const wrist=(side:number,sign:number)=>layout.wrist[side].clone().addScaledVector(frame.normal,sign*thickness/2);
  const rim=fingers.map((r,f)=>r[0].map(v=>v.clone().addScaledVector(frame.up,f===0?0:thickness*p.rootInset)));
  const front=[wrist(0,1),...rim.flatMap(r=>[r[0],r[1]]),wrist(1,1)];
  const back=[wrist(0,-1),...rim.flatMap(r=>[r[3],r[2]]),wrist(1,-1)];
  const center=front.reduce((v,x)=>v.add(x),new Vector3()).divideScalar(front.length).addScaledVector(frame.normal,-thickness/2);
  // Inset measured in palm-thickness units, with a convex homothetic contour.
  const edgeDistance=Math.min(...front.map((v,i)=> {
    const edge=front[(i+1)%front.length].clone().sub(v);
    return edge.length()>1e-12 ? Math.abs(edge.cross(center.clone().sub(v)).dot(frame.normal))/edge.length() : Infinity;
  }));
  const inset=thickness*p.palmBevel;
  const fraction=Math.min(.45,inset/Math.max(edgeDistance,1e-12));
  const inner = (outline:Vector3[],sign:number) => outline.map(v=> {
    const planar=v.clone().addScaledVector(frame.normal,-sign*thickness/2);
    return planar.lerp(center,fraction).addScaledVector(frame.normal,sign*(thickness/2+inset));
  });
  const top=inner(front,1), bottom=inner(back,-1);
  const topCenter=top.reduce((v,x)=>v.add(x),new Vector3()).divideScalar(top.length);
  const bottomCenter=bottom.reduce((v,x)=>v.add(x),new Vector3()).divideScalar(bottom.length);
  for(let i=0;i<front.length;i++) {
    const n=(i+1)%front.length;
    quad(front[n],front[i],top[i],top[n]); quad(back[i],back[n],bottom[n],bottom[i]);
    tri(topCenter,top[n],top[i]); tri(bottomCenter,bottom[i],bottom[n]);
    // Odd edges are finger openings: their ring sides belong to the fingers.
    if(i%2===0||i===front.length-1) quad(front[i],front[n],back[n],back[i]);
  }
  if(offset!==positions.length) throw new Error('Hand mesh topology/buffer size mismatch');
}
