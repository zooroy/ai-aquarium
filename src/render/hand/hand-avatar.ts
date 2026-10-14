import { BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, InstancedBufferAttribute, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { GRAB_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import { createRandom } from '../../core/random';
import type { HandPose } from '../../input/hand/types';
import { advanceHandBubbles, boneTransform, bubbleOpacity, transformHandJoints, handRadii } from './hand-transforms';
import type { HandBubble } from './hand-transforms';

const EDGES = Array.from({ length: 5 }, (_, finger) => {
  const base = finger * 4 + 1;
  return [[base, base + 1], [base + 1, base + 2], [base + 2, base + 3]];
}).flat();
const PALM = [0, 1, 5, 9, 13, 17];
const material = (color: number) => new MeshLambertMaterial({ color, flatShading: true, transparent: true, depthWrite: false });

export class HandAvatar {
  private readonly root = new Group();
  private readonly bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, p.radialSegments, p.heightSegments), material(0xffffff), 15);
  private readonly palm = new Mesh(new BufferGeometry(), material(PALETTE.hand.base));
  private readonly bubbles: Mesh<IcosahedronGeometry, MeshLambertMaterial>[] = [];
  private particles: HandBubble[] = [];
  private readonly random = createRandom(p.bubbleSeed);
  private pressed = false;
  constructor(private readonly scene: Scene, _camera: PerspectiveCamera) {
    this.root.name = 'hand-avatar'; this.root.visible = false;
    this.bones.name = 'hand-fingers';
    // 共用等粗圓柱；只在每根手指的末段套用指尖收窄。
    this.bones.geometry.setAttribute('aTipRatio', new InstancedBufferAttribute(
      new Float32Array(EDGES.map(([, b]) => b % 4 === 0 ? p.tipRadiusRatio : 1)), 1));
    this.bones.geometry.setAttribute('aPinchGlow', new InstancedBufferAttribute(new Float32Array(15), 1));
    this.bones.material.emissive.set(PALETTE.hand.glow);
    this.bones.material.emissiveIntensity = p.glowIntensity;
    this.bones.material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float aTipRatio; attribute float aPinchGlow; varying float vPinchGlow;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz *= mix(1.0, aTipRatio, position.y + 0.5);\nvPinchGlow = aPinchGlow;');
      shader.fragmentShader = 'varying float vPinchGlow;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vPinchGlow;');
    };
    this.bones.material.customProgramCacheKey = () => 'hand-finger-tip-glow-v2';
    this.palm.material.side = DoubleSide;
    this.palm.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(20 * 9), 3));
    for (const object of [this.bones, this.palm]) {
      object.renderOrder = p.renderOrder; object.frustumCulled = false; this.root.add(object);
    }
    for (let i = 0; i < p.bubbleCount; i++) {
      const mesh = new Mesh(new IcosahedronGeometry(p.bubbleRadius, 0), material(PALETTE.bubbles));
      mesh.renderOrder = p.renderOrder; mesh.visible = false; this.bubbles.push(mesh); this.root.add(mesh);
    }
    scene.add(this.root);
  }
  sync(pose: HandPose, dt: number, screenToWorld: (x: number, y: number, z: number) => Vector3): void {
    const target = screenToWorld(pose.pointer.x, pose.pointer.y, GRAB_PARAMS.holdZ);
    const joints = transformHandJoints(pose, target);
    this.root.visible = (pose.visible || pose.opacity > 0) && joints.length === 21;
    this.particles = advanceHandBubbles(this.particles, dt);
    if (joints.length !== 21) { this.pressed = false; return; }
    const pressed = pose.visible && pose.pressed;
    if (pressed && !this.pressed) this.particles = Array.from({ length: p.bubbleCount }, () => ({
      position: target.clone(), age: 0,
      velocity: new Vector3(this.random.range(-p.bubbleSpread, p.bubbleSpread), this.random.range(p.bubbleSpeed / 2, p.bubbleSpeed), this.random.range(-p.bubbleSpread, p.bubbleSpread)),
    }));
    this.pressed = pressed;
    const radii = handRadii(joints, EDGES);
    EDGES.forEach(([a, b], i) => {
      this.bones.setMatrixAt(i, boneTransform(joints[a], joints[b], radii[i], radii[i] * p.endExtension));
      const glow = pressed && (b === 4 || b === 8);
      this.bones.setColorAt(i, new Color(glow ? PALETTE.hand.glow : PALETTE.hand.base));
      this.bones.geometry.getAttribute('aPinchGlow').setX(i, glow ? 1 : 0);
    });
    this.bones.instanceMatrix.needsUpdate = true;
    this.bones.geometry.getAttribute('aPinchGlow').needsUpdate = true;
    if (this.bones.instanceColor) this.bones.instanceColor.needsUpdate = true;
    const positions: number[] = [];
    const front = PALM.map((id) => joints[id].clone().add(new Vector3(0, 0, p.palmThickness / 2)));
    const back = PALM.map((id) => joints[id].clone().add(new Vector3(0, 0, -p.palmThickness / 2)));
    const tri = (a: Vector3, b: Vector3, c: Vector3) => { for (const v of [a,b,c]) positions.push(v.x,v.y,v.z); };
    for (let i = 1; i < PALM.length - 1; i++) { tri(front[0], front[i], front[i+1]); tri(back[0], back[i+1], back[i]); }
    for (let i = 0; i < PALM.length; i++) { const j = (i+1)%PALM.length; tri(front[i],back[i],front[j]); tri(front[j],back[i],back[j]); }
    const attribute = this.palm.geometry.getAttribute('position');
    // 6邊形擠出：8個端面三角形 + 12個側面三角形。
    (attribute.array as Float32Array).set(positions); attribute.needsUpdate = true;
    this.palm.geometry.setDrawRange(0, positions.length / 3); this.palm.geometry.computeVertexNormals();
    for (const mesh of [this.bones,this.palm]) mesh.material.opacity = pose.opacity;
    this.bubbles.forEach((mesh,i) => {
      const bubble = this.particles[i]; mesh.visible = !!bubble;
      if (bubble) { mesh.position.copy(bubble.position); mesh.material.opacity = pose.opacity * bubbleOpacity(bubble.age); }
    });
  }
  dispose(): void {
    this.scene.remove(this.root);
    for (const mesh of [this.bones,this.palm,...this.bubbles]) {
      if (mesh instanceof InstancedMesh) mesh.dispose();
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.particles = [];
  }
}
