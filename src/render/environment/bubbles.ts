import { IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Scene } from 'three';
import { BUBBLE_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { GroundContext, EnvironmentModule } from './types';

export function advanceBubble(y: number, dt: number, speed: number, bottom: number, surface: number): number {
  const next = y + Math.max(0, dt) * speed;
  return next > surface || next < bottom ? bottom : next;
}

export function createBubbles(scene: Scene, ctx: GroundContext): EnvironmentModule {
  const geometry = new IcosahedronGeometry(p.radius, 0);
  const material = new MeshLambertMaterial({ color: PALETTE.bubbles, flatShading: true, transparent: true, opacity: p.opacity, depthWrite: false });
  const mesh = new InstancedMesh(geometry, material, p.count);
  mesh.name = 'bubbles'; mesh.frustumCulled = false;
  const bubbles = Array.from({ length: p.count }, () => ({
    fraction: ctx.random.range(-1, 1), z: ctx.random.range(ctx.getBounds().min.z, ctx.getBounds().max.z),
    speed: ctx.random.range(p.minSpeed, p.maxSpeed), phase: ctx.random.range(0, Math.PI * 2), y: 0,
  }));
  const matrix = new Object3D();
  let lastTime: number | undefined;
  let previousBounds: ReturnType<GroundContext['getBounds']> | undefined;
  const bottoms: number[] = [];
  function update(time: number) {
    const bounds = ctx.getBounds();
    const dt = lastTime === undefined ? 0 : Math.max(0, time - lastTime);
    bubbles.forEach((bubble, index) => {
      const x = bubble.fraction * bounds.max.x;
      if (bounds !== previousBounds) {
        bottoms[index] = ctx.getHeight(x, bubble.z) + p.radius;
        if (lastTime === undefined) bubble.y = ctx.random.range(bottoms[index], bounds.max.y);
      }
      bubble.y = advanceBubble(bubble.y, dt, bubble.speed, bottoms[index], bounds.max.y + p.surfaceOffset);
      matrix.position.set(x + Math.sin(time * p.frequency + bubble.phase) * p.sway, bubble.y, bubble.z);
      matrix.updateMatrix(); mesh.setMatrixAt(index, matrix.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    previousBounds = bounds; lastTime = time;
  }
  scene.add(mesh); update(0);
  return { update, dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); } };
}
