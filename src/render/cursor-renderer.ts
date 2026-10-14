import { IcosahedronGeometry, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { CURSOR_PARAMS as p, GRAB_PARAMS } from '../config/params';
import { PALETTE } from '../config/palette';
import type { InputState } from '../input/types';
import { updateCursorStates } from './cursor-state';
import type { CursorVisualState } from './cursor-state';

export class CursorRenderer {
  private states: CursorVisualState[] = [];
  private readonly meshes = new Map<string, Mesh<IcosahedronGeometry, MeshLambertMaterial>>();
  constructor(private readonly scene: Scene, private readonly camera: PerspectiveCamera) {}

  sync(state: InputState, dt: number): void {
    this.states = updateCursorStates(this.states, { pointers: state.pointers.filter((pointer) => pointer.source !== 'hand') }, dt);
    const active = new Set(this.states.map((item) => item.id));
    for (const [id, mesh] of this.meshes) if (!active.has(id)) {
      this.remove(mesh); this.meshes.delete(id);
    }
    this.camera.updateMatrixWorld();
    const origin = this.camera.getWorldPosition(new Vector3());
    for (const item of this.states) {
      let mesh = this.meshes.get(item.id);
      if (!mesh) {
        mesh = new Mesh(new IcosahedronGeometry(p.radius, 0), new MeshLambertMaterial({
          color: PALETTE.cursor, emissive: PALETTE.cursor, flatShading: true,
          transparent: true, opacity: p.opacity, depthWrite: false,
        }));
        mesh.name = `cursor-${item.id}`;
        this.meshes.set(item.id, mesh); this.scene.add(mesh);
      }
      const ray = new Vector3(item.x * 2 - 1, 1 - item.y * 2, 0).unproject(this.camera).sub(origin);
      const distance = (GRAB_PARAMS.holdZ - origin.z) / ray.z;
      mesh.visible = Number.isFinite(distance) && distance >= 0;
      if (mesh.visible) mesh.position.copy(origin).addScaledVector(ray, distance);
      mesh.scale.setScalar(1 + (p.pressedScale - 1) * item.activation);
      mesh.material.emissiveIntensity = p.idleEmissive + (p.pressedEmissive - p.idleEmissive) * item.activation;
      mesh.rotation.y += p.rotationSpeed * Math.max(0, dt);
    }
  }
  private remove(mesh: Mesh<IcosahedronGeometry, MeshLambertMaterial>): void {
    this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
  }
  dispose(): void {
    for (const mesh of this.meshes.values()) this.remove(mesh);
    this.meshes.clear(); this.states = [];
  }
}
