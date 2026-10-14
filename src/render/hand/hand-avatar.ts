import { Bone, BufferAttribute, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GRAB_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import { createRandom } from '../../core/random';
import type { HandPose } from '../../input/hand/types';
import { advanceHandBubbles, bubbleOpacity, transformHandJoints, tiltHandJoints } from './hand-transforms';
import type { HandBubble } from './hand-transforms';
import { HAND_REST_POSES } from './hand-rest-pose';
import { drivenBoneFrames, handedness, restBoneFrames, skinWeights, writeRigColors } from './hand-rig';

interface Rig { mesh: SkinnedMesh; joints:Vector3[]; bones:Bone[]; fallback:readonly number[]; hand:'left'|'right'; indices:Uint16Array; weights:Float32Array }
export interface HandAvatarOptions { load?:()=>Promise<Group>; debugRig?:boolean }
const material=()=>new MeshLambertMaterial({color:0xffffff,flatShading:true,vertexColors:true,transparent:true});
export class HandAvatar {
  private readonly root=new Group();
  private readonly rigs:Rig[]=[];
  private readonly bubbles:Mesh<IcosahedronGeometry,MeshLambertMaterial>[]=[];
  private readonly dots:Mesh<IcosahedronGeometry,MeshLambertMaterial>[]=[];
  private particles:HandBubble[]=[];
  private readonly random=createRandom(p.bubbleSeed);
  private pressed=false;
  private disposed=false;
  readonly ready:Promise<void>;
  constructor(private readonly scene:Scene,_camera:PerspectiveCamera,options:HandAvatarOptions={}) {
    this.root.name='hand-avatar';this.root.visible=false;scene.add(this.root);
    for(let i=0;i<p.bubbleCount;i++) {
      const mesh=new Mesh(new IcosahedronGeometry(p.bubbleRadius,0),new MeshLambertMaterial({color:PALETTE.bubbles,flatShading:true,transparent:true}));
      mesh.visible=false;mesh.renderOrder=p.renderOrder;this.bubbles.push(mesh);this.root.add(mesh);
    }
    if(options.debugRig) for(let i=0;i<42;i++) {
      const dot=new Mesh(new IcosahedronGeometry(p.rigDotRadius,0),new MeshLambertMaterial({color:i<21?PALETTE.hand.rigRest:PALETTE.hand.rigCurrent,depthTest:false}));
      dot.renderOrder=p.renderOrder+1;this.dots.push(dot);this.root.add(dot);
    }
    const load=options.load??(async()=> (await new GLTFLoader().loadAsync('/models/low-poly-hands.rigged.glb')).scene);
    this.ready=Promise.resolve().then(load).then(model=>{
      try {
        if(this.disposed) return;
        for(const data of HAND_REST_POSES) {
          const source=model.getObjectByName(data.name);
          if(!(source instanceof Mesh)) throw Error(`Missing hand mesh ${data.name}`);
          const geometry=source.geometry.clone();geometry.computeVertexNormals();
          const joints=data.joints.map(v=>new Vector3(...v));
          const {indices,weights}=skinWeights(geometry.getAttribute('position').array,joints,data.fallback);
          geometry.setAttribute('skinIndex',new BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new BufferAttribute(weights,4));
          geometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*3),3));
          const mesh=new SkinnedMesh(geometry,material()),frames=restBoneFrames(joints,data.fallback);
          const bones=frames.map(frame=>{const bone=new Bone();bone.matrixAutoUpdate=false;bone.matrix.copy(frame);mesh.add(bone);return bone;});
          mesh.updateMatrixWorld(true);mesh.bind(new Skeleton(bones));
          mesh.name=data.name;mesh.frustumCulled=false;mesh.renderOrder=p.renderOrder;mesh.visible=false;
          this.root.add(mesh);this.rigs.push({mesh,joints,bones,fallback:data.fallback,hand:data.hand,indices,weights});
        }
      } finally {
        model.traverse(object=>{if(object instanceof Mesh) {object.geometry.dispose();for(const mat of Array.isArray(object.material)?object.material:[object.material]) mat.dispose();}});
      }
    }).catch(error=>{console.warn('3D 手模型載入失敗',error);this.releaseRigs();});
  }
  sync(pose:HandPose,dt:number,screenToWorld:(x:number,y:number,z:number)=>Vector3):void {
    if(this.disposed) return;
    const target=screenToWorld(pose.pointer.x,pose.pointer.y,GRAB_PARAMS.holdZ);
    const joints=tiltHandJoints(transformHandJoints(pose,target));
    this.root.visible=(pose.visible||pose.opacity>0)&&joints.length===21&&this.rigs.length>0;
    if(joints.length!==21) {this.pressed=false;return;}
    const pressed=pose.visible&&pose.pressed;
    this.particles=advanceHandBubbles(this.particles,dt);
    if(pressed&&!this.pressed) this.particles=Array.from({length:p.bubbleCount},()=>({position:target.clone(),age:0,velocity:new Vector3(this.random.range(-p.bubbleSpread,p.bubbleSpread),this.random.range(p.bubbleSpeed/2,p.bubbleSpeed),this.random.range(-p.bubbleSpread,p.bubbleSpread))}));
    this.pressed=pressed;
    for(const rig of this.rigs) {
      rig.mesh.visible=rig.hand===handedness(joints);
      if(!rig.mesh.visible) continue;
      const frames=drivenBoneFrames(rig.joints,joints,rig.fallback);
      frames.forEach((frame,i)=>rig.bones[i].matrix.copy(frame));rig.mesh.updateMatrixWorld(true);
      const colors=rig.mesh.geometry.getAttribute('color');writeRigColors(colors.array as Float32Array,rig.indices,rig.weights,pressed,rig.fallback);colors.needsUpdate=true;
      const mat=rig.mesh.material as MeshLambertMaterial;mat.opacity=pose.opacity;mat.depthWrite=pose.opacity===1;
      // Rest landmarks follow the palm only; current landmarks show actual articulation.
      const palm=frames[0].clone().multiply(restBoneFrames(rig.joints,rig.fallback)[0].invert());
      this.dots.forEach((dot,i)=>dot.position.copy(i<21?rig.joints[i].clone().applyMatrix4(palm):joints[i-21]));
    }
    this.bubbles.forEach((mesh,i)=>{const bubble=this.particles[i];mesh.visible=!!bubble;if(bubble) {mesh.position.copy(bubble.position);mesh.material.opacity=pose.opacity*bubbleOpacity(bubble.age);}});
  }
  private releaseRigs():void { for(const {mesh} of this.rigs) {this.root.remove(mesh);mesh.skeleton.dispose();mesh.geometry.dispose();(mesh.material as MeshLambertMaterial).dispose();} this.rigs.length=0; }
  dispose():void {this.disposed=true;this.scene.remove(this.root);this.releaseRigs();for(const mesh of [...this.bubbles,...this.dots]) {mesh.geometry.dispose();mesh.material.dispose();}this.particles=[];}
}
