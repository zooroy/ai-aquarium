import { BufferGeometry, FrontSide, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { GRAB_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import { createRandom } from '../../core/random';
import type { HandPose } from '../../input/hand/types';
import { advanceHandBubbles, bubbleOpacity, transformHandJoints, tiltHandJoints } from './hand-transforms';
import type { HandBubble } from './hand-transforms';

import { HAND_VERTEX_COUNT, writeHandMesh } from './hand-mesh';

const material = (color: number) => new MeshLambertMaterial({ color, flatShading: true, transparent: true, depthWrite: false });

export class HandAvatar {
  private readonly root = new Group();
  private readonly hand = new Mesh(new BufferGeometry(), material(0xffffff));
  private readonly bubbles: Mesh<IcosahedronGeometry, MeshLambertMaterial>[] = [];
  private particles: HandBubble[] = [];
  private readonly random = createRandom(p.bubbleSeed);
  private pressed = false;
  constructor(private readonly scene: Scene, _camera: PerspectiveCamera) {
    this.root.name = 'hand-avatar'; this.root.visible = false;
    this.hand.name = 'hand-surface';
    this.hand.material.vertexColors = true;
    this.hand.material.side = FrontSide;
    this.hand.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(HAND_VERTEX_COUNT*3),3));
    this.hand.geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(HAND_VERTEX_COUNT*3),3));
    this.hand.geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(HAND_VERTEX_COUNT*3),3));
    this.hand.renderOrder=p.renderOrder; this.hand.frustumCulled=false; this.root.add(this.hand);
    for (let i = 0; i < p.bubbleCount; i++) {
      const mesh = new Mesh(new IcosahedronGeometry(p.bubbleRadius, 0), material(PALETTE.bubbles));
      mesh.renderOrder = p.renderOrder; mesh.visible = false; this.bubbles.push(mesh); this.root.add(mesh);
    }
    scene.add(this.root);
  }
  sync(pose: HandPose, dt: number, screenToWorld: (x: number, y: number, z: number) => Vector3): void {
    const target = screenToWorld(pose.pointer.x, pose.pointer.y, GRAB_PARAMS.holdZ);
    const joints = tiltHandJoints(transformHandJoints(pose, target));
    this.root.visible = (pose.visible || pose.opacity > 0) && joints.length === 21;
    this.particles = advanceHandBubbles(this.particles, dt);
    if (joints.length !== 21) { this.pressed = false; return; }
    const pressed = pose.visible && pose.pressed;
    if (pressed && !this.pressed) this.particles = Array.from({ length: p.bubbleCount }, () => ({
      position: target.clone(), age: 0,
      velocity: new Vector3(this.random.range(-p.bubbleSpread, p.bubbleSpread), this.random.range(p.bubbleSpeed / 2, p.bubbleSpeed), this.random.range(-p.bubbleSpread, p.bubbleSpread)),
    }));
    this.pressed = pressed;
    const geometry=this.hand.geometry;
    writeHandMesh(joints,pressed,geometry.getAttribute('position').array as Float32Array,geometry.getAttribute('color').array as Float32Array);
    geometry.getAttribute('position').needsUpdate=true;
    geometry.getAttribute('color').needsUpdate=true;
    geometry.computeVertexNormals();
    this.hand.material.opacity=pose.opacity;
    this.bubbles.forEach((mesh,i) => {
      const bubble = this.particles[i]; mesh.visible = !!bubble;
      if (bubble) { mesh.position.copy(bubble.position); mesh.material.opacity = pose.opacity * bubbleOpacity(bubble.age); }
    });
  }
  dispose(): void {
    this.scene.remove(this.root);
    for (const mesh of [this.hand,...this.bubbles]) {
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.particles = [];
  }
}
