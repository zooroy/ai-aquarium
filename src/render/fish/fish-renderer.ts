import { createNoise3D } from 'simplex-noise';
import { createRandom } from '../../core/random';
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import type { Scene } from 'three';
import { FISH_PARAMS, FISH_RENDER_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { Fish } from '../../simulation/fish-state';
import { createFishGeometry } from './fish-geometry';
import { applySwimShader } from './swim-shader';

const panicNoise = createNoise3D(createRandom(p.jitterSeed).next);

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
      const x = item.forward.clone().normalize();
      const horizontal = Math.hypot(x.x, x.z);
      let yaw = this.yaw.get(item.id) ?? (horizontal > p.poleThreshold ? Math.atan2(x.z, x.x) : 0);
      if (horizontal > p.poleThreshold) {
        const target = Math.atan2(x.z, x.x);
        const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
        yaw += Math.max(-p.yawRate * dt, Math.min(p.yawRate * dt, delta));
      }
      this.yaw.set(item.id, yaw);
      // 水平側向基底保留上一幀 yaw；垂直附近不以接近零的叉積決定方向。
      let z = new Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      z.addScaledVector(x, -z.dot(x));
      if (z.lengthSq() < 1e-8) z = new Vector3(0, 1, 0).cross(x);
      z.normalize();
      const y = z.clone().cross(x).normalize();
      const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
      const panic = Math.max(0, Math.min(1, item.panic));
      const position = item.position.clone();
      for (const [axis, offset] of [['x', 0], ['y', 1], ['z', 2]] as const) position[axis] += panic * p.jitterAmp * panicNoise(time * p.jitterFreq, item.id, offset);
      rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), panic * p.wobbleAngle * Math.sin(time * p.wobbleFreq + item.phase)));
      const matrix = new Matrix4().compose(position, rotation, new Vector3().setScalar(item.scale));
      const index = group.mesh.count++;
      group.mesh.setMatrixAt(index, matrix);
      const ratio = Math.max(0, Math.min(1, (item.velocity.length() - FISH_PARAMS.minSpeed) / (FISH_PARAMS.maxSpeed - FISH_PARAMS.minSpeed)));
      group.mesh.geometry.getAttribute('aSwimPhase').setX(index, item.phase);
      group.mesh.geometry.getAttribute('aSwimFreq').setX(index, (p.minFreq + ratio * (p.maxFreq - p.minFreq)) * (1 + p.panicFreqGain * panic));
      group.mesh.geometry.getAttribute('aSwimAmp').setX(index, p.defaultAmp * (1 + p.panicAmpGain * panic));
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
