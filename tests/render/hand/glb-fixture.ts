import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { makeNativeRig } from '../../../src/render/hand/hand-rig';
import type { RigBone } from '../../../src/render/hand/hand-rig';
interface Node {name:string;children?:number[];matrix?:number[];translation?:[number,number,number];rotation?:[number,number,number,number];scale?:[number,number,number];mesh?:number}
interface Gltf {nodes:Node[];skins:{joints:number[];inverseBindMatrices:number}[];meshes:{primitives:{attributes:Record<string,number>}[]}[];accessors:{componentType:number;count:number;type:string;bufferView:number;byteOffset?:number}[];bufferViews:{byteOffset?:number;byteStride?:number}[]}
export function readNativeFixture() {
  const bytes=readFileSync('public/models/glove-hand.glb'),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const length=view.getUint32(12,true),json: Gltf=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length)));
  const binOffset=28+length;
  function accessor(id:number) {
    const a=json.accessors[id],v=json.bufferViews[a.bufferView],size=a.type==='MAT4'?16:Number(a.type.slice(-1))||1;
    const width=a.componentType===5121?1:a.componentType===5123?2:4;
    return Array.from({length:a.count*size},(_,i)=>{
      const offset=binOffset+(v.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/size)*(v.byteStride??size*width)+(i%size)*width;
      return a.componentType===5121?view.getUint8(offset):a.componentType===5126?view.getFloat32(offset,true):a.componentType===5123?view.getUint16(offset,true):view.getUint32(offset,true);
    });
  }
  const parents=json.nodes.map((_,i)=>json.nodes.findIndex(n=>n.children?.includes(i)));
  const locals=json.nodes.map(n=>n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1]))));
  const worlds:Matrix4[]=[];
  const world=(i:number):Matrix4=>worlds[i]??(worlds[i]=(parents[i]<0?new Matrix4():world(parents[i]).clone()).multiply(locals[i]));
  json.nodes.forEach((_,i)=>world(i));
  const ids=json.skins[0].joints;
  const bones:RigBone[]=ids.map(id=>{const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();locals[id].decompose(position,rotation,scale);return {name:json.nodes[id].name,parent:ids.indexOf(parents[id]),position,rotation,scale};});
  const attributes=json.meshes[0].primitives[0].attributes,positions=accessor(attributes.POSITION),indices=accessor(attributes.JOINTS_0),weights=accessor(attributes.WEIGHTS_0);
  const inverseBinds=accessor(json.skins[0].inverseBindMatrices);
  const skinMatrices=ids.map((id,i)=>worlds[id].clone().multiply(new Matrix4().fromArray(inverseBinds,i*16)));
  const vertices=Array.from({length:positions.length/3},(_,i)=>{
    const position=new Vector3().fromArray(positions,i*3),result=new Vector3();
    for(let k=0;k<4;k++) {
      const weight=weights[i*4+k];
      if(weight>0) result.addScaledVector(position.clone().applyMatrix4(skinMatrices[indices[i*4+k]]),weight);
    }
    return result;
  });
  const rig=makeNativeRig(bones,worlds[parents[ids[0]]]);
  return {bytes,json,rig,vertices,indices,weights};
}

/** Node-only fixture: remove image references, retaining authored PBR factors and geometry. */
export function texturelessGlb(): ArrayBuffer {
  const {bytes}=readNativeFixture();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length))) as Record<string,unknown>;
  delete json.images;delete json.textures;delete json.samplers;
  for(const name of ['extensionsUsed','extensionsRequired']) if(Array.isArray(json[name])) json[name]=(json[name] as string[]).filter(s=>s!=='EXT_texture_webp');
  function strip(value:unknown):void {
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)) {
      if(key.endsWith('Texture')) delete (value as Record<string,unknown>)[key];
      else strip(item);
    }
  }
  strip(json.materials);
  const encoded=new TextEncoder().encode(JSON.stringify(json)),size=Math.ceil(encoded.length/4)*4;
  const bin=bytes.subarray(20+length),output=new Uint8Array(20+size+bin.length),header=new DataView(output.buffer);
  header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,output.length,true);
  header.setUint32(12,size,true);header.setUint32(16,0x4e4f534a,true);
  output.fill(32,20,20+size);output.set(encoded,20);output.set(bin,20+size);
  return output.buffer;
}
