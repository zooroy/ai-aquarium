import { Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { handFrame, fingerRings, writeHandMesh, HAND_VERTEX_COUNT, HAND_TRIANGLES } from '../../../src/render/hand/hand-mesh';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { transformHandJoints } from '../../../src/render/hand/hand-transforms';
function joints(time=0) {
  const provider=new HandProvider(); provider.ingest(createReplaySource(getReplayScript('demo')).frameAt(time),time);
  return transformHandJoints(provider.getHandPose(time),new Vector3());
}
it('constructs orthonormal axes, including collapsed input fallback',()=>{
  for(const points of [joints(),Array.from({length:21},()=>new Vector3())]) {
    const {across,up,normal}=handFrame(points);
    for(const axis of [across,up,normal]) expect(axis.length()).toBeCloseTo(1);
    expect(across.dot(up)).toBeCloseTo(0); expect(across.dot(normal)).toBeCloseTo(0); expect(up.dot(normal)).toBeCloseTo(0);
  }
});
it('emits matching shared rings on both sides of every finger joint',()=>{
  const points=joints(), positions=new Float32Array(HAND_VERTEX_COUNT*3), colors=new Float32Array(positions.length);
  writeHandMesh(points,false,positions,colors);
  for(let f=0;f<5;f++) {
    const rings=fingerRings(points,1+f*4);
    for(let joint=1;joint<3;joint++) for(let k=0;k<4;k++) {
      // Outward quad emits [start,startNext,endNext,start,endNext,end].
      const incoming=(f*26*3+(joint-1)*24+k*6+5)*3;
      const outgoing=(f*26*3+joint*24+k*6)*3;
      expect(Array.from(positions.slice(incoming,incoming+3))).toEqual(Array.from(positions.slice(outgoing,outgoing+3)));
      expect(new Vector3().fromArray(positions,outgoing).distanceTo(rings[joint][k])).toBeLessThan(1e-6);
    }
  }
});
it('keeps topology and buffers fixed across poses and colors only the two distal sections',()=>{
  const positions=new Float32Array(HAND_VERTEX_COUNT*3), colors=new Float32Array(positions.length);
  expect(HAND_TRIANGLES).toBeGreaterThanOrEqual(150); expect(HAND_TRIANGLES).toBeLessThanOrEqual(250);
  writeHandMesh(joints(),false,positions,colors); const base=colors.slice();
  for(const time of [1000,3000,5000,8000]) {
    writeHandMesh(joints(time),true,positions,colors);
    expect(positions.length).toBe(HAND_VERTEX_COUNT*3); expect(positions.every(Number.isFinite)).toBe(true);
    for(let vertex=0;vertex<HAND_VERTEX_COUNT;vertex++) {
      const finger=Math.floor(vertex/78), local=vertex%78;
      const changed=colors[vertex*3]!==base[vertex*3];
      expect(changed).toBe(finger<2&&local>=48);
    }
  }
  writeHandMesh(joints(),false,positions,colors); expect(colors).toEqual(base);
});
it('keeps positive gaps between adjacent finger root rings',()=>{
  for(const time of [0,1000,3000,5000,8000]) {
    const points=joints(time), frame=handFrame(points);
    const roots=[5,9,13,17].map(id=>fingerRings(points,id,frame)[0]);
    for(let i=0;i<3;i++) {
      const right=Math.max(...roots[i].map(v=>v.dot(frame.across)));
      const left=Math.min(...roots[i+1].map(v=>v.dot(frame.across)));
      expect(left-right).toBeGreaterThan(0);
    }
  }
});
it('orients every upper and lower palm face and bevel consistently without flips',()=>{
  for(const time of [0,1000,3000,5000,8000]) {
    const points=joints(time), normal=handFrame(points).normal;
    const positions=new Float32Array(HAND_VERTEX_COUNT*3), colors=new Float32Array(positions.length);
    writeHandMesh(points,false,positions,colors);
    let triangle=130;
    for(let edge=0;edge<12;edge++) {
      // Per edge: upper bevel x2, lower bevel x2, upper/lower face.
      for(const sign of [1,1,-1,-1,1,-1]) {
        const a=new Vector3().fromArray(positions,triangle*9);
        const b=new Vector3().fromArray(positions,triangle*9+3);
        const c=new Vector3().fromArray(positions,triangle*9+6);
        expect(b.sub(a).cross(c.sub(a)).dot(normal)*sign).toBeGreaterThan(0);
        triangle++;
      }
      if(edge%2===0||edge===11) triangle+=2;
    }
  }
});
it('keeps rectangular non-flipped rings at 120-degree bends and near the across axis',()=>{
  for(const nearAcross of [false,true]) {
    const points=joints(), frame=handFrame(points), start=points[5].clone();
    const incoming=nearAcross?frame.across.clone():frame.up.clone();
    const outgoing=incoming.clone().applyAxisAngle(frame.normal,2*Math.PI/3);
    points[6]=start.clone().addScaledVector(incoming,.4);
    points[7]=points[6].clone().addScaledVector(outgoing,.25);
    points[8]=points[7].clone().addScaledVector(outgoing,.2);
    const rings=fingerRings(points,5,frame);
    for(const ring of rings) {
      const edges=ring.map((v,i)=>ring[(i+1)%4].clone().sub(v));
      for(let i=0;i<4;i++) {
        expect(edges[i].length()).toBeGreaterThan(1e-6);
        expect(edges[i].dot(edges[(i+1)%4])).toBeCloseTo(0);
      }
      expect(edges[0].clone().add(edges[2]).length()).toBeLessThan(1e-12);
      const n=edges[0].clone().cross(edges[1]);
      expect(n.dot(edges[2].clone().cross(edges[3]))).toBeGreaterThan(0);
    }
    for(let i=1;i<rings.length;i++) {
      const axes=(r:Vector3[])=> {
        const width=r[1].clone().sub(r[0]).normalize();
        return {width,normal:width.clone().cross(r[3].clone().sub(r[0])).normalize()};
      };
      const a=axes(rings[i-1]), b=axes(rings[i]);
      // Compare after transporting through the bend, not in fixed world axes.
      expect(a.width.applyQuaternion(new Quaternion().setFromUnitVectors(a.normal,b.normal)).dot(b.width)).toBeGreaterThan(.99);
    }
  }
});
it('keeps replay pinch fingers distinct and all rings non-degenerate',()=>{
  const points=joints(5000), frame=handFrame(points);
  const thumb=fingerRings(points,1,frame), index=fingerRings(points,5,frame);
  const center=(ring:Vector3[])=>ring.reduce((v,p)=>v.add(p),new Vector3()).divideScalar(4);
  for(const finger of [thumb,index]) for(const ring of finger) {
    const width=ring[1].clone().sub(ring[0]), depth=ring[3].clone().sub(ring[0]);
    expect(width.length()).toBeGreaterThan(1e-6); expect(depth.length()).toBeGreaterThan(1e-6);
    expect(width.dot(depth)).toBeCloseTo(0);
    expect(width.clone().cross(depth).length()).toBeGreaterThan(1e-6);
  }
  for(let a=0;a<3;a++) for(let b=0;b<3;b++) {
    const thickness=Math.max(thumb[a][0].distanceTo(thumb[a][3]),index[b][0].distanceTo(index[b][3]));
    expect(center(thumb[a]).distanceTo(center(index[b]))).toBeGreaterThan(thickness*.8);
  }
});
