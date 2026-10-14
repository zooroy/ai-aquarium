import { BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { GRAB_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import { createRandom } from '../../core/random';
import type { HandPose } from '../../input/hand/types';
import { advanceHandBubbles, boneTransform, bubbleOpacity, transformHandJoints, handRadii } from './hand-transforms';
import type { HandBubble } from './hand-transforms';

const EDGES = Array.from({ length: 5 }, (_, finger) => {
  const base = finger * 4 + 1;
  return [[0, base], [base, base + 1], [base + 1, base + 2], [base + 2, base + 3]];
}).flat();
const PALM = [0, 1, 5, 9, 13, 17];
const material = (color: number) => new MeshLambertMaterial({ color, flatShading: true, transparent: true, depthWrite: false });

export class HandAvatar {
  private readonly root = new Group();
  private readonly joints = new InstancedMesh(new IcosahedronGeometry(1, 0), material(PALETTE.hand.joint), 21);
  private readonly bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 6), material(PALETTE.hand.base), 20);
  private readonly palm = new Mesh(new BufferGeometry(), material(PALETTE.hand.base));
  private readonly tips = new InstancedMesh(new IcosahedronGeometry(1, 0), material(PALETTE.hand.glow), 2);
  private readonly bubbles: Mesh<IcosahedronGeometry, MeshLambertMaterial>[] = [];
  private particles: HandBubble[] = [];
  private readonly random = createRandom(p.bubbleSeed);
  private pressed = false;
  constructor(private readonly scene: Scene, _camera: PerspectiveCamera) {
    this.root.name = 'hand-avatar'; this.root.visible = false;
    this.joints.material.color.set(0xffffff);
    this.palm.material.side = DoubleSide;
    this.palm.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(20 * 9), 3));
    for (const object of [this.joints, this.bones, this.palm, this.tips]) {
      object.renderOrder = p.renderOrder; object.frustumCulled = false; this.root.add(object);
    }
    this.tips.material.emissive.set(PALETTE.hand.glow); this.tips.material.emissiveIntensity = p.glowIntensity;
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
    for (let i = 0; i < 21; i++) {
      const scale = radii.joints[i];
      const matrix = new Matrix4().compose(joints[i], new Quaternion(), new Vector3().setScalar(scale));
      this.joints.setMatrixAt(i, matrix);
      this.joints.setColorAt(i, new Color(pressed && (i === 4 || i === 8) ? PALETTE.hand.glow : PALETTE.hand.joint));
    }
    this.joints.instanceMatrix.needsUpdate = true;
    if (this.joints.instanceColor) this.joints.instanceColor.needsUpdate = true;
    EDGES.forEach(([a, b], i) => this.bones.setMatrixAt(i, boneTransform(joints[a], joints[b], radii.bones[i])));
    this.bones.instanceMatrix.needsUpdate = true;
    this.tips.visible = pressed;
    [4, 8].forEach((id, i) => this.tips.setMatrixAt(i, new Matrix4().compose(joints[id], new Quaternion(), new Vector3().setScalar(radii.joints[id]))));
    this.tips.instanceMatrix.needsUpdate = true;
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
    for (const mesh of [this.joints,this.bones,this.palm,this.tips]) mesh.material.opacity = pose.opacity;
    this.bubbles.forEach((mesh,i) => {
      const bubble = this.particles[i]; mesh.visible = !!bubble;
      if (bubble) { mesh.position.copy(bubble.position); mesh.material.opacity = pose.opacity * bubbleOpacity(bubble.age); }
    });
  }
  dispose(): void {
    this.scene.remove(this.root);
    for (const mesh of [this.joints,this.bones,this.palm,this.tips,...this.bubbles]) {
      if (mesh instanceof InstancedMesh) mesh.dispose();
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.particles = [];
  }
}
