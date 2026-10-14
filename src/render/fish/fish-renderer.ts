import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial } from 'three';
import type { Scene } from 'three';
import { FISH_PARAMS, FISH_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { Fish } from '../../simulation/fish-state';
import { createFishGeometry } from './fish-geometry';
import { applySwimShader } from './swim-shader';

import { computeSwimPose } from './swim-pose';

export class FishRenderer {
  private groups: ReturnType<FishRenderer['createGroups']>;
  private capacity: number;
  private readonly yaw = new Map<number, number>();
  private previousTime: number | undefined;
  constructor(private readonly scene: Scene, capacity: number = FISH_PARAMS.count) {
    this.capacity = Math.max(1, capacity);
    this.groups = this.createGroups();
  }
  private createGroups() {
    return PALETTE.fish.map((palette, variant) => {
      const geometry = createFishGeometry();
      const colors = geometry.getAttribute('color');
      const regions = [new Color(palette.body), new Color(palette.fins), new Color(palette.belly)];
      for (let i = 0; i < colors.count; i++) {
        const color = regions[colors.getX(i) === 1 ? 0 : colors.getY(i) === 1 ? 1 : 2];
        colors.setXYZ(i, color.r, color.g, color.b);
      }
      for (const name of ['aSwimPhase', 'aSwimFreq', 'aSwimAmp']) {
        const values = new Float32Array(this.capacity);
        if (name === 'aSwimAmp') values.fill(p.defaultAmp);
        geometry.setAttribute(name, new InstancedBufferAttribute(values, 1).setUsage(DynamicDrawUsage));
      }
      const material = new MeshLambertMaterial({ flatShading: true, vertexColors: true });
      const swim = applySwimShader(material);
      const mesh = new InstancedMesh(geometry, material, this.capacity);
      mesh.name = `fish-${variant}`; mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.scene.add(mesh);
      return { mesh, swim };
    });
  }
  sync(fish: Fish[], time: number): void {
    if (fish.length > this.capacity) {
      this.releaseGroups(); this.capacity = fish.length; this.groups = this.createGroups();
    }
    for (const group of this.groups) { group.mesh.count = 0; group.swim.uniforms.uTime.value = time; }
    const dt = this.previousTime === undefined ? 0 : Math.max(0, time - this.previousTime);
    const live = new Set<number>();
    for (const item of fish) {
      const group = this.groups[item.variant];
      if (!group) continue;
      live.add(item.id);
      const pose = computeSwimPose(item, time, dt, this.yaw.get(item.id));
      this.yaw.set(item.id, pose.yaw);
      const index = group.mesh.count++;
      group.mesh.setMatrixAt(index, pose.matrix);
      group.mesh.geometry.getAttribute('aSwimPhase').setX(index, pose.phase);
      group.mesh.geometry.getAttribute('aSwimFreq').setX(index, pose.frequency);
      group.mesh.geometry.getAttribute('aSwimAmp').setX(index, pose.amplitude);
    }
    for (const id of this.yaw.keys()) if (!live.has(id)) this.yaw.delete(id);
    for (const { mesh } of this.groups) {
      mesh.instanceMatrix.needsUpdate = true;
      for (const name of ['aSwimPhase', 'aSwimFreq', 'aSwimAmp']) mesh.geometry.getAttribute(name).needsUpdate = true;
    }
    this.previousTime = time;
  }
  private releaseGroups(): void {
    for (const { mesh } of this.groups) { this.scene.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  dispose(): void { this.releaseGroups(); this.yaw.clear(); }
}
