import { Mesh, MeshLambertMaterial, SRGBColorSpace } from 'three';
import type { Scene, Texture } from 'three';
import type { Fish } from '../../simulation/fish-state';
import { createFishGeometry } from './fish-geometry';
import { computeSwimPose } from './swim-pose';
import { applySwimShader } from './swim-shader';
import { applyPosterizeShader } from './posterize-shader';

export class CustomFishRenderer {
  private readonly geometry = createFishGeometry();
  private readonly entries = new Map<string, {
    mesh: Mesh<ReturnType<typeof createFishGeometry>, MeshLambertMaterial>;
    swim: ReturnType<typeof applySwimShader>; yaw?: number;
  }>();
  private previousTime: number | undefined;
  constructor(private readonly scene: Scene) {}
  /** Transfers ownership of texture; each custom fish should supply its own texture. */
  add(customId: string, texture: Texture): void {
    if (this.entries.has(customId)) throw new Error('Duplicate custom fish id');
    texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
    const material = new MeshLambertMaterial({ flatShading: true, map: texture });
    const swim = applySwimShader(material);
    applyPosterizeShader(material);
    const mesh = new Mesh(this.geometry, material);
    mesh.name = `custom-fish-${customId}`; mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false; mesh.visible = false;
    this.entries.set(customId, { mesh, swim }); this.scene.add(mesh);
  }
  remove(customId: string): void {
    const entry = this.entries.get(customId);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.mesh.material.map?.dispose(); entry.mesh.material.dispose();
    this.entries.delete(customId);
  }
  sync(fish: Fish[], time: number): void {
    const dt = this.previousTime === undefined ? 0 : Math.max(0, time - this.previousTime);
    for (const entry of this.entries.values()) entry.mesh.visible = false;
    for (const item of fish) {
      if (item.customId === undefined) continue;
      const entry = this.entries.get(item.customId);
      if (!entry) continue;
      const pose = computeSwimPose(item, time, dt, entry.yaw);
      entry.yaw = pose.yaw;
      entry.mesh.matrix.copy(pose.matrix); entry.mesh.matrixWorldNeedsUpdate = true;
      entry.mesh.visible = true;
      const u = entry.swim.uniforms;
      u.uTime.value = time; u.uSwimPhase.value = pose.phase;
      u.uSwimFreq.value = pose.frequency; u.uSwimAmp.value = pose.amplitude;
    }
    for (const entry of this.entries.values()) if (!entry.mesh.visible) entry.yaw = undefined;
    this.previousTime = time;
  }
  dispose(): void {
    for (const id of this.entries.keys()) this.remove(id);
    this.geometry.dispose(); this.previousTime = undefined;
  }
}
