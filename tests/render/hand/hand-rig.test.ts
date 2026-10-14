import { readFileSync } from 'node:fs';
import { Matrix4, Triangle, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { parseGlb, deriveRest, preprocess, encodeGlb } from '../../../scripts/hand-model.mjs';
import { HAND_REST_POSES } from '../../../src/render/hand/hand-rest-pose';
import { boneSegments, deformationMatrices, handFrame, handedness, skinWeights, writeRigColors } from '../../../src/render/hand/hand-rig';
const original=parseGlb(readFileSync('public/models/low-poly-hands.glb'));
const rest=deriveRest(original);
const processed=original.map((m,i)=>preprocess(m,rest[i]));
it('reproducibly derives 21 bounded landmarks and keeps fingertips beyond the joints',()=>{
  rest.forEach((pose,index)=>{
    expect(pose.joints).toEqual(HAND_REST_POSES[index].joints);expect(pose.joints).toHaveLength(21);
    const vertices=original[index].vertices;
    for(const point of pose.joints) for(let axis=0;axis<3;axis++) {
      expect(point[axis]).toBeGreaterThanOrEqual(Math.min(...vertices.map(v=>v[axis])));
      expect(point[axis]).toBeLessThanOrEqual(Math.max(...vertices.map(v=>v[axis])));
    }
    for(let f=0;f<5;f++) {
      const base=1+4*f,root=new Vector3(...pose.joints[base]),tip=new Vector3(...pose.joints[base+3]),direction=tip.clone().sub(root).normalize();
      const end=tip.clone().sub(root).dot(direction);
      for(let j=1;j<3;j++) expect(new Vector3(...pose.joints[base+j]).sub(root).dot(direction)).toBeLessThan(end);
      // Tip is within the model's terminal bevel region, not halfway along the finger.
      const candidates=vertices.filter(v=>new Vector3(...v).sub(root).cross(direction).length()<.018);
      const furthest=Math.max(...candidates.map(v=>new Vector3(...v).sub(root).dot(direction)));
      expect(furthest-end).toBeLessThan(.025);
    }
  });
});
it('subdivides only on original triangles, preserving every rest surface and winding',()=>{
  processed.forEach((model,i)=>{
    let area=0;
    for(const face of model.faces) {
      const source=new Triangle(...original[i].triangles[face.source].map(p=>new Vector3(...p)) as [Vector3,Vector3,Vector3]);
      const points=face.triangle.map(p=>new Vector3(...p));
      for(const point of [...points,points[0].clone().add(points[1]).add(points[2]).divideScalar(3)]) {
        expect(source.closestPointToPoint(point,new Vector3()).distanceTo(point)).toBeLessThan(1e-7);
      }
      const triangle=new Triangle(...points as [Vector3,Vector3,Vector3]);area+=triangle.getArea();
      expect(triangle.getNormal(new Vector3()).dot(source.getNormal(new Vector3()))).toBeGreaterThan(.999);
    }
    const oldArea=original[i].triangles.reduce((sum,t)=>sum+new Triangle(...t.map(p=>new Vector3(...p)) as [Vector3,Vector3,Vector3]).getArea(),0);
    expect(area).toBeCloseTo(oldArea,10);
    expect(model.fallback).toEqual([]);
    for(const rings of model.rings) for(const ring of rings) {
      expect(ring.vertices.length).toBeGreaterThanOrEqual(3);
      for(const point of ring.vertices) expect(Math.abs(new Vector3(...point).sub(new Vector3(...ring.origin)).dot(new Vector3(...ring.normal)))).toBeLessThan(1e-7);
    }
  });
  expect(parseGlb(encodeGlb(processed)).map(m=>m.triangles.length)).toEqual(processed.map(m=>m.faces.length));
});
it('binds normalized weights to nearest bones with only adjacent blending; rest deformation is identity',()=>{
  processed.forEach((model,i)=>{
    const joints=rest[i].joints.map(p=>new Vector3(...p)),positions=model.faces.flatMap(f=>f.triangle.flat());
    const {indices,weights}=skinWeights(positions,joints),segments=boneSegments();
    expect(segments).toHaveLength(16);
    const matrices=deformationMatrices(joints,joints);
    matrices.forEach(m=>m.elements.forEach((v,k)=>expect(v).toBeCloseTo(new Matrix4().elements[k],10)));
    for(let v=0;v<positions.length/3;v++) {
      expect(weights.slice(v*4,v*4+4).reduce((a,b)=>a+b,0)).toBeCloseTo(1,6);
      const primary=segments[indices[v*4]],secondary=segments[indices[v*4+1]];
      if(weights[v*4+1]>0) expect(primary.some(id=>secondary.includes(id)) || (indices[v*4]===0&&(secondary[0]-1)%4===0) || (indices[v*4+1]===0&&(primary[0]-1)%4===0)).toBe(true);
      const point=new Vector3().fromArray(positions,v*3),deformed=new Vector3();
      for(let k=0;k<4;k++) deformed.addScaledVector(point.clone().applyMatrix4(matrices[indices[v*4+k]]),weights[v*4+k]);
      expect(deformed.distanceTo(point)).toBeLessThan(1e-7);
    }
    // Finger centerline vertices must bind to their own finger, not a neighboring digit.
    for(let f=0;f<5;f++) for(let k=0;k<3;k++) {
      const a=1+f*4+k,point=joints[a].clone().lerp(joints[a+1],.5);
      const skin=skinWeights(point.toArray(),joints);
      // The thumb's first segment intentionally blends with the palm; it only has to include its own bone.
      if(f===0&&k===0) expect([skin.indices[0],skin.indices[1]]).toContain(1);
      else expect(skin.indices[0]).toBe(1+f*3+k);
    }
  });
});
it('chooses mirrored hands, changes distal colors only, and supports two-bone fallback',()=>{
  rest.forEach(pose=>{
    const joints=pose.joints.map(p=>new Vector3(...p));expect(handedness(joints)).toBe(pose.hand);
    expect(handedness(joints.map(p=>new Vector3(-p.x,p.y,p.z)))).not.toBe(pose.hand);
    const {across,up,normal}=handFrame(joints);expect(across.dot(up)).toBeCloseTo(0);expect(normal.length()).toBeCloseTo(1);
    const positions=processed[rest.indexOf(pose)].faces.flatMap(f=>f.triangle.flat()),skin=skinWeights(positions,joints);
    const colors=new Float32Array(positions.length);writeRigColors(colors,skin.indices,skin.weights,false);const base=colors.slice();
    writeRigColors(colors,skin.indices,skin.weights,true);
    expect(colors).not.toEqual(base);
    const segments=boneSegments();
    for(let v=0;v<positions.length/3;v++) if(![0,1,2,3].some(k=>[4,8].includes(segments[skin.indices[v*4+k]][1])&&skin.weights[v*4+k]>0)) expect(colors.slice(v*3,v*3+3)).toEqual(base.slice(v*3,v*3+3));
    expect(boneSegments([0])).toHaveLength(15);expect(boneSegments([0])).toContainEqual([2,4]);
  });
});

it('does not assign actual fingertip vertices to neighboring fingers',()=>{
  const joints=rest[0].joints.map(p=>new Vector3(...p));
  for(const [finger,lo,hi] of [[1,-.16,-.105],[2,-.2,-.16],[3,-.242,-.2],[4,-.29,-.242]]) {
    const points=original[0].vertices.filter(p=>p[0]>=lo&&p[0]<hi&&p[1]>.18);
    expect(points.length).toBeGreaterThan(0);
    const skin=skinWeights(points.flat(),joints);
    points.forEach((_,i)=>expect(Math.floor((skin.indices[i*4]-1)/3)).toBe(finger));
  }
});
it('keeps the processed surface watertight after binary serialization',()=>{
  for(const model of parseGlb(encodeGlb(processed))) {
    const edges=new Map<string,number>();
    for(const triangle of model.triangles) for(let k=0;k<3;k++) {
      const ends=[triangle[k],triangle[(k+1)%3]].map(p=>p.map(x=>x.toFixed(7)).join(','));
      if(ends[0]===ends[1]) continue;
      const key=ends.sort().join('|');edges.set(key,(edges.get(key)??0)+1);
    }
    expect([...edges.values()].filter(count=>count===1)).toEqual([]);
  }
});
it('maps articulated bone endpoints to current landmarks and keeps coincident vertices welded',()=>{
  const joints=rest[0].joints.map(p=>new Vector3(...p)),current=joints.map(p=>p.clone());
  current[7].add(new Vector3(.01,-.015,.015));current[8].add(new Vector3(.02,-.04,.03));
  const matrices=deformationMatrices(joints,current),segments=boneSegments();
  segments.forEach(([a,b],i)=>{
    expect(joints[a].clone().applyMatrix4(matrices[i]).distanceTo(current[a])).toBeLessThan(1e-10);
    expect(joints[b].clone().applyMatrix4(matrices[i]).distanceTo(current[b])).toBeLessThan(1e-10);
  });
  const positions=processed[0].faces.flatMap(f=>f.triangle.flat()),skin=skinWeights(positions,joints);
  const seen=new Map<string,Vector3>();
  for(let v=0;v<positions.length/3;v++) {
    const point=new Vector3().fromArray(positions,v*3),key=point.toArray().map(x=>x.toFixed(7)).join(',');
    const deformed=new Vector3();
    for(let k=0;k<4;k++) deformed.addScaledVector(point.clone().applyMatrix4(matrices[skin.indices[v*4+k]]),skin.weights[v*4+k]);
    if(seen.has(key)) expect(deformed.distanceTo(seen.get(key)!)).toBeLessThan(2e-7);
    else seen.set(key,deformed);
  }
});
it('reports two-bone fallback if a finger surface cannot be intersected',()=>{
  const empty={...original[0],triangles:[]};
  expect(preprocess(empty,rest[0]).fallback).toEqual([0,1,2,3,4]);
});
it('pins wrist vertices to the palm and limits vertex stretch in replay pinch',async()=>{
  const {createReplaySource,getReplayScript}=await import('../../../src/input/hand/replay-source');
  const frame=createReplaySource(getReplayScript('demo')).frameAt(5000)!;
  for(let model=0;model<2;model++) {
    const joints=rest[model].joints.map(p=>new Vector3(...p));
    const current=frame.worldLandmarks.map(p=>new Vector3(model===0?-p.x:p.x,-p.y,p.z));
    // Compare in equal palm-size units: display/worldScale must not count as a spike.
    const scale=joints[0].distanceTo(joints[9])/current[0].distanceTo(current[9]);
    const origin=current[0].clone();current.forEach(p=>p.sub(origin).multiplyScalar(scale).add(joints[0]));
    const matrices=deformationMatrices(joints,current),segments=boneSegments();
    const positions=processed[model].faces.flatMap(f=>f.triangle.flat()),skin=skinWeights(positions,joints);
    const distance=(p:Vector3,a:Vector3,b:Vector3)=> {
      const d=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(d)/d.lengthSq()));
      return p.distanceTo(a.clone().addScaledVector(d,t));
    };
    let wristCount=0,maxExcess=0;
    const up=handFrame(joints).up;
    for(let v=0;v<positions.length/3;v++) {
      const point=new Vector3().fromArray(positions,v*3),deformed=new Vector3();
      if(point.clone().sub(joints[0]).dot(up)<joints[1].clone().sub(joints[0]).dot(up)) {
        expect(skin.indices[v*4]).toBe(0);expect(skin.weights[v*4]).toBe(1);wristCount++;
      }
      for(let k=0;k<4;k++) deformed.addScaledVector(point.clone().applyMatrix4(matrices[skin.indices[v*4+k]]),skin.weights[v*4+k]);
      const [a,b]=segments[skin.indices[v*4]];
      maxExcess=Math.max(maxExcess,distance(deformed,current[a],current[b])-1.3*distance(point,joints[a],joints[b]));
    }
    expect(wristCount).toBeGreaterThan(0);expect(maxExcess).toBeLessThan(.005);
  }
});
