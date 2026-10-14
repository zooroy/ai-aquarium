import { Matrix4, Vector3 } from 'three';
const vec=p=>new Vector3(...p);
const mean=ps=>ps.reduce((v,p)=>v.add(vec(p)),new Vector3()).divideScalar(ps.length).toArray();
export function parseGlb(bytes) {
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(data.getUint32(0,true)!==0x46546c67||data.getUint32(4,true)!==2) throw Error('Expected GLB 2');
  let json,bin;
  for(let offset=12;offset<bytes.length;) {
    const length=data.getUint32(offset,true), type=data.getUint32(offset+4,true);
    const chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a) json=JSON.parse(new TextDecoder().decode(chunk));
    if(type===0x004e4942) bin=chunk;
    offset+=8+length;
  }
  if(!json||!bin) throw Error('Missing GLB chunks');
  function accessor(id) {
    const a=json.accessors[id], view=json.bufferViews[a.bufferView];
    const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type], width=a.componentType===5126?4:2;
    const d=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
    return Array.from({length:a.count},(_,i)=>Array.from({length:size},(_,k)=>{
      const offset=(view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||size*width)+k*width;
      return a.componentType===5126?d.getFloat32(offset,true):d.getUint16(offset,true);
    }));
  }
  return json.nodes.filter(n=>n.mesh!==undefined).map(node=>{
    const primitive=json.meshes[node.mesh].primitives[0], vertices=accessor(primitive.attributes.POSITION);
    const indices=primitive.indices===undefined?vertices.map((_,i)=>i):accessor(primitive.indices).flat();
    return {name:node.name,vertices,triangles:Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(id=>vertices[id]))};
  });
}
function basis(a,b,c) {
  const x=vec(b).sub(vec(a)).normalize(), z=x.clone().cross(vec(c).sub(vec(a))).normalize(), y=z.clone().cross(x);
  return new Matrix4().makeBasis(x,y,z).setPosition(vec(a));
}
export function deriveRest(models) {
  const left=models.find(m=>m.name==='group589964233'), right=models.find(m=>m.name==='group1380155712');
  const points=[...new Map(left.vertices.map(p=>[p.join(','),p])).values()];
  const joints=[mean(points.filter(p=>p[1]<-.02))];
  // Model-specific palm/thumb junction and terminal cap, inferred from surface clusters.
  const thumb=points.filter(p=>p[0]>-.105);
  const tip=mean(thumb.filter(p=>p[0]>-.045));
  const base=mean(points.filter(p=>p[0]>-.125&&p[0]<-.1&&p[1]<.05));
  const mid=mean(thumb.filter(p=>p[0]>-.077&&p[0]<-.06));
  joints.push(base,vec(base).lerp(vec(mid),.55).toArray(),mid,tip);
  for(const [lo,hi] of [[-.16,-.105],[-.2,-.16],[-.242,-.2],[-.29,-.242]]) {
    const finger=points.filter(p=>p[0]>=lo&&p[0]<hi&&p[1]>.08);
    const top=Math.max(...finger.map(p=>p[1]));
    const end=mean(finger.filter(p=>p[1]>top-.006));
    const root=mean(finger.filter(p=>p[1]<.10));
    const middle=mean(finger.filter(p=>p[1]>.105&&p[1]<top-.025));
    joints.push(root,middle,vec(middle).lerp(vec(end),.6).toArray(),end);
  }
  // The two supplied meshes have matching reversed triangle corners.
  const reflected=left.vertices.map(([x,y,z])=>[-x,y,z]);
  const transform=basis(right.vertices[2],right.vertices[1],right.vertices[0])
    .multiply(basis(reflected[0],reflected[1],reflected[2]).invert());
  const map=p=>vec([-p[0],p[1],p[2]]).applyMatrix4(transform).toArray();
  const maxError=Math.max(...left.vertices.map(p=>Math.min(...right.vertices.map(q=>vec(map(p)).distanceTo(vec(q))))));
  if(maxError>1e-5) throw Error(`Mirror correspondence failed: ${maxError}`);
  return [{name:left.name,hand:'right',joints},{name:right.name,hand:'left',joints:joints.map(map)}];
}
function distanceToSegment(p,a,b) {
  const d=vec(b).sub(vec(a)), t=Math.max(0,Math.min(1,vec(p).sub(vec(a)).dot(d)/d.lengthSq()));
  return vec(p).distanceTo(vec(a).addScaledVector(d,t));
}
export function fingerOwner(point,joints) {
  const palm=distanceToSegment(point,joints[0],mean([joints[5],joints[9],joints[13],joints[17]]));
  let owner=-1, best=palm;
  for(let f=0;f<5;f++) for(let k=0;k<3;k++) {
    const d=distanceToSegment(point,joints[1+f*4+k],joints[2+f*4+k]);
    if(d<best) { best=d; owner=f; }
  }
  return owner;
}
export function splitTriangle(triangle,origin,normal) {
  const distance=p=>vec(p).sub(vec(origin)).dot(vec(normal));
  const ds=triangle.map(distance);
  if(Math.min(...ds)>=-1e-12||Math.max(...ds)<=1e-12) return [triangle];
  const result=[];
  for(const sign of [-1,1]) {
    const poly=[];
    for(let i=0;i<3;i++) {
      const a=triangle[i],b=triangle[(i+1)%3],da=ds[i]*sign,db=ds[(i+1)%3]*sign;
      if(da>=0) poly.push(a);
      if((da<0&&db>0)||(da>0&&db<0)) poly.push(vec(a).lerp(vec(b),da/(da-db)).toArray());
    }
    for(let i=1;i<poly.length-1;i++) result.push([poly[0],poly[i],poly[i+1]]);
  }
  return result;
}
export function preprocess(model,rest) {
  let faces=model.triangles.map((triangle,source)=>({triangle,source}));
  const fallback=[], rings=[];
  for(let f=0;f<5;f++) {
    const before=faces;
    const fingerRings=[];
    for(let k=0;k<3;k++) {
      const id=1+f*4+k, origin=rest.joints[id];
      const normal=vec(rest.joints[id+1]).sub(vec(origin)).normalize().toArray();
      // Find complete connected surface contours, then cut the one surrounding
      // this finger. Selecting individual triangles by centroid creates T-junctions.
      const key=p=>p.map(x=>x.toFixed(7)).join(',');
      const candidates=[];
      faces.forEach((face,index)=> {
        const distances=face.triangle.map(p=>vec(p).sub(vec(origin)).dot(vec(normal)));
        if(Math.min(...distances)>1e-12||Math.max(...distances)<-1e-12) return;
        const intersections=[];
        for(let e=0;e<3;e++) {
          const n=(e+1)%3, da=distances[e],db=distances[n];
          if(Math.abs(da)<1e-12) intersections.push(face.triangle[e]);
          if(da*db<0) intersections.push(vec(face.triangle[e]).lerp(vec(face.triangle[n]),da/(da-db)).toArray());
        }
        const unique=intersections.filter((p,i)=>!intersections.slice(0,i).some(q=>vec(p).distanceTo(vec(q))<1e-12));
        if(unique.length>=2) candidates.push({index,points:unique});
      });
      const groups=[];
      const pending=new Set(candidates);
      while(pending.size) {
        const first=pending.values().next().value, group=[first], keys=new Set(first.points.map(key));pending.delete(first);
        let changed=true;
        while(changed) {
          changed=false;
          for(const item of pending) if(item.points.some(p=>keys.has(key(p)))) {
            pending.delete(item);group.push(item);item.points.forEach(p=>keys.add(key(p)));changed=true;
          }
        }
        groups.push(group);
      }
      groups.sort((a,b)=>vec(mean(a.flatMap(c=>c.points))).distanceTo(vec(origin))-vec(mean(b.flatMap(c=>c.points))).distanceTo(vec(origin)));
      const selected=new Set((groups[0]||[]).map(c=>c.index));
      faces=faces.flatMap((face,index)=>selected.has(index)
        ?splitTriangle(face.triangle,origin,normal).map(triangle=>({...face,triangle})): [face]);
      const ring=[...new Map(faces.flatMap(face=>face.triangle).filter(p=>
        Math.abs(vec(p).sub(vec(origin)).dot(vec(normal)))<1e-7&&fingerOwner(p,rest.joints)===f)
        .map(p=>[p.map(x=>x.toFixed(7)).join(','),p])).values()];
      fingerRings.push({origin,normal,vertices:ring});
    }
    if(fingerRings.some(r=>r.vertices.length<3)) { faces=before; fallback.push(f); }
    rings.push(fingerRings);
  }
  return {name:model.name,faces,fallback,rings};
}
export function encodeGlb(models) {
  const chunks=[], views=[], accessors=[], meshes=[]; let offset=0;
  for(const model of models) {
    const values=new Float32Array(model.faces.flatMap(f=>f.triangle.flat()));
    const bytes=new Uint8Array(values.buffer); chunks.push(bytes);
    views.push({buffer:0,byteOffset:offset,byteLength:bytes.length}); offset+=bytes.length;
    const min=[0,1,2].map(k=>Math.min(...model.faces.flatMap(f=>f.triangle.map(p=>p[k]))));
    const max=[0,1,2].map(k=>Math.max(...model.faces.flatMap(f=>f.triangle.map(p=>p[k]))));
    accessors.push({bufferView:views.length-1,componentType:5126,count:values.length/3,type:'VEC3',min,max});
    meshes.push({primitives:[{attributes:{POSITION:accessors.length-1},mode:4}]});
  }
  const json={asset:{version:'2.0',generator:'ai-aquarium surface-only hand subdivision'},scene:0,
    scenes:[{nodes:models.map((_,i)=>i)}],nodes:models.map((m,i)=>({name:m.name,mesh:i})),meshes,
    buffers:[{byteLength:offset}],bufferViews:views,accessors};
  const text=new TextEncoder().encode(JSON.stringify(json)); const padded=(text.length+3)&~3;
  const out=new Uint8Array(12+8+padded+8+offset),d=new DataView(out.buffer);
  d.setUint32(0,0x46546c67,true);d.setUint32(4,2,true);d.setUint32(8,out.length,true);
  d.setUint32(12,padded,true);d.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+padded);out.set(text,20);
  d.setUint32(20+padded,offset,true);d.setUint32(24+padded,0x004e4942,true);
  let cursor=28+padded;for(const chunk of chunks) {out.set(chunk,cursor);cursor+=chunk.length;}
  return out;
}
