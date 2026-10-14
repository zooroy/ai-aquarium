import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { makeNativeRig } from '../../../src/render/hand/hand-rig';
import type { RigBone } from '../../../src/render/hand/hand-rig';
interface Node {name:string;children?:number[];matrix?:number[];translation?:[number,number,number];rotation?:[number,number,number,number];scale?:[number,number,number];mesh?:number}
interface Gltf {nodes:Node[];skins:{joints:number[]}[];meshes:{primitives:{attributes:Record<string,number>}[]}[];accessors:{componentType:number;count:number;type:string;bufferView:number;byteOffset?:number}[];bufferViews:{byteOffset?:number;byteStride?:number}[]}
export function readNativeFixture() {
  const bytes=readFileSync('public/models/vr-hand-right.glb'),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const length=view.getUint32(12,true),json: Gltf=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length)));
  const binOffset=28+length;
  function accessor(id:number) {
    const a=json.accessors[id],v=json.bufferViews[a.bufferView],size=Number(a.type.slice(-1))||1;
    const width=a.componentType===5123?2:4;
    return Array.from({length:a.count*size},(_,i)=>{
      const offset=binOffset+(v.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/size)*(v.byteStride??size*width)+(i%size)*width;
      return a.componentType===5126?view.getFloat32(offset,true):a.componentType===5123?view.getUint16(offset,true):view.getUint32(offset,true);
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
  const meshWorld=worlds[json.nodes.findIndex(n=>n.mesh===0)];
  const vertices=Array.from({length:positions.length/3},(_,i)=>new Vector3().fromArray(positions,i*3).applyMatrix4(meshWorld));
  const rig=makeNativeRig(bones,worlds[parents[ids[0]]],vertices,indices,weights);
  return {bytes,json,rig,vertices,indices,weights};
}
