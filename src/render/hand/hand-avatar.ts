import { Bone, FrontSide, Texture, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, SkinnedMesh, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GRAB_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import { createRandom } from '../../core/random';
import { assetUrl } from '../../core/asset-url';
import type { HandPose } from '../../input/hand/types';
import { advanceHandBubbles, bubbleOpacity, transformHandJoints, tiltHandJoints } from './hand-transforms';
import type { HandBubble } from './hand-transforms';
import { ROOT_BONE, FINGER_BONES, loadedBoneName, makeNativeRig, drivePose, MODEL_HANDEDNESS } from './hand-rig';
import type { NativeRig, RigBone } from './hand-rig';

interface Rig { mesh:SkinnedMesh; bones:Bone[]; definition:NativeRig; model:Group }
export interface HandAvatarOptions { load?:()=>Promise<Group>; debugRig?:boolean }
export class HandAvatar {
  private readonly root=new Group();
  private rig:Rig|undefined;
  private readonly holder=new Group();
  private readonly bubbles:Mesh<IcosahedronGeometry,MeshLambertMaterial>[]=[];
  private readonly dots:Mesh<IcosahedronGeometry,MeshLambertMaterial>[]=[];
  private particles:HandBubble[]=[];
  private readonly random=createRandom(p.bubbleSeed);
  private pressed=false;
  private disposed=false;
  readonly ready:Promise<void>;
  constructor(private readonly scene:Scene,_camera:PerspectiveCamera,options:HandAvatarOptions={}) {
    this.root.name='hand-avatar';this.root.visible=false;scene.add(this.root);
    this.holder.matrixAutoUpdate=false;this.root.add(this.holder);
    for(let i=0;i<p.bubbleCount;i++) {
      const mesh=new Mesh(new IcosahedronGeometry(p.bubbleRadius,0),new MeshLambertMaterial({color:PALETTE.bubbles,flatShading:true,transparent:true}));
      mesh.visible=false;mesh.renderOrder=p.renderOrder;this.bubbles.push(mesh);this.root.add(mesh);
    }
    if(options.debugRig) for(let i=0;i<42;i++) {
      const dot=new Mesh(new IcosahedronGeometry(p.rigDotRadius,0),new MeshLambertMaterial({color:i<21?PALETTE.hand.rigBones:PALETTE.hand.rigCurrent,depthTest:false}));
      dot.renderOrder=p.renderOrder+1;this.dots.push(dot);this.root.add(dot);
    }
    const load=options.load??(async()=> (await new GLTFLoader().loadAsync(assetUrl('models/glove-hand.glb'))).scene);
    this.ready=Promise.resolve().then(load).then(model=>{
      if(this.disposed) {this.disposeModel(model);return;}
      try {
        model.updateMatrixWorld(true);
        for(const name of [ROOT_BONE,...FINGER_BONES.flat()]) {
          if(!(model.getObjectByName(loadedBoneName(name)) instanceof Bone)) throw Error(`Missing hand bone ${name}`);
        }
        let mesh:SkinnedMesh|undefined;
        const extras:SkinnedMesh[]=[];
        model.traverse(object=>{if(object instanceof SkinnedMesh) {if(!mesh) mesh=object;else extras.push(object);}});
        for(const extra of extras) { extra.removeFromParent(); this.disposeModel(extra); }
        if(!mesh) throw Error('Missing skinned hand');
        const hand:SkinnedMesh=mesh,bones=hand.skeleton.bones;
        const snapshot:RigBone[]=bones.map(bone=>({name:bone.name,parent:bones.indexOf(bone.parent as Bone),position:bone.position.clone(),rotation:bone.quaternion.clone(),scale:bone.scale.clone()}));
        const root=bones.find(bone=>!bones.includes(bone.parent as Bone))!;
        const definition=makeNativeRig(snapshot,root.parent!.matrixWorld.clone());
        for(const mat of Array.isArray(hand.material)?hand.material:[hand.material]) {
          mat.transparent=true; mat.side=FrontSide;
        }
        hand.frustumCulled=false;hand.renderOrder=p.renderOrder;
        this.holder.add(model);this.rig={mesh:hand,bones,definition,model};
      } catch(error) {this.disposeModel(model);throw error;}
    }).catch(error=>{console.warn('3D 手模型載入失敗',error);this.releaseRigs();});
  }
  sync(pose:HandPose,dt:number,screenToWorld:(x:number,y:number,z:number)=>Vector3):void {
    if(this.disposed) return;
    const target=screenToWorld(pose.pointer.x,pose.pointer.y,GRAB_PARAMS.holdZ);
    const joints=tiltHandJoints(transformHandJoints(pose,target));
    this.root.visible=(pose.visible||pose.opacity>0)&&joints.length===21&&!!this.rig&&pose.handedness!==null;
    if(joints.length!==21) {this.pressed=false;return;}
    const pressed=pose.visible&&pose.pressed;
    this.particles=advanceHandBubbles(this.particles,dt);
    if(pressed&&!this.pressed) this.particles=Array.from({length:p.bubbleCount},()=>({position:target.clone(),age:0,velocity:new Vector3(this.random.range(-p.bubbleSpread,p.bubbleSpread),this.random.range(p.bubbleSpeed/2,p.bubbleSpeed),this.random.range(-p.bubbleSpread,p.bubbleSpread))}));
    this.pressed=pressed;
    const rig=this.rig;
    if(rig&&pose.handedness!==null) {
      const driven=drivePose(rig.definition,joints,target,pose.handedness!==MODEL_HANDEDNESS);
      driven.rotations.forEach((rotation,i)=>rig.bones[i].quaternion.copy(rotation));
      this.holder.matrix.copy(driven.placement);
      this.holder.matrix.decompose(this.holder.position,this.holder.quaternion,this.holder.scale);
      this.holder.updateMatrixWorld(true);
      this.dots.forEach((dot,i)=>{if(i<21) dot.position.copy(driven.landmarks[i]);else dot.position.copy(driven.targets[i-21]);});
    }
    if(rig) for(const mat of Array.isArray(rig.mesh.material)?rig.mesh.material:[rig.mesh.material]) {mat.opacity=pose.opacity;mat.depthWrite=pose.opacity===1;}
    this.bubbles.forEach((mesh,i)=>{const bubble=this.particles[i];mesh.visible=!!bubble;if(bubble) {mesh.position.copy(bubble.position);mesh.material.opacity=pose.opacity*bubbleOpacity(bubble.age);}});
  }
  private disposeModel(model:Group|SkinnedMesh):void {
    model.traverse(object=>{if(object instanceof Mesh) {object.geometry.dispose();for(const mat of Array.isArray(object.material)?object.material:[object.material]) {
      for(const value of Object.values(mat)) if(value instanceof Texture) value.dispose();
      mat.dispose();
    }if(object instanceof SkinnedMesh) object.skeleton.dispose();}});
  }
  private releaseRigs():void {if(this.rig) {this.holder.remove(this.rig.model);this.disposeModel(this.rig.model);this.rig=undefined;}}
  dispose():void {this.disposed=true;this.scene.remove(this.root);this.releaseRigs();for(const mesh of [...this.bubbles,...this.dots]) {mesh.geometry.dispose();mesh.material.dispose();}this.particles=[];}
}
