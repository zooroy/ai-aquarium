import { IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import type { Scene } from 'three';
import { SPLASH_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { Random } from '../../core/random';

export interface SplashBubble {
  position: Vector3;
  velocity: Vector3;
  /** Seconds since the burst; at or past `life` the bubble is hidden. */
  age: number;
}

/** Spreads outward while horizontal speed decays, keeps rising, and reports its remaining size (0 = hidden). */
export function advanceSplashBubble(bubble: SplashBubble, dt: number): number {
  if (bubble.age >= p.life) return 0;
  const step = Math.max(0, dt);
  bubble.age += step;
  const decay = Math.exp(-p.drag * step);
  bubble.velocity.x *= decay; bubble.velocity.z *= decay;
  bubble.position.addScaledVector(bubble.velocity, step);
  return Math.max(0, 1 - bubble.age / p.life);
}

/** A fixed pool of instanced bubbles; each burst reuses the oldest slots instead of creating meshes. */
export function createSplash(scene: Scene, random: Random) {
  const geometry = new IcosahedronGeometry(p.radius, 0);
  const material = new MeshLambertMaterial({ color: PALETTE.bubbles, flatShading: true, transparent: true, opacity: p.opacity, depthWrite: false });
  const mesh = new InstancedMesh(geometry, material, p.poolSize);
  mesh.name = 'splash'; mesh.frustumCulled = false;
  const pool: SplashBubble[] = Array.from({ length: p.poolSize }, () => ({ position: new Vector3(), velocity: new Vector3(), age: p.life }));
  const matrix = new Object3D();
  let next = 0;
  let lastTime: number | undefined;

  function write(index: number, size: number): void {
    matrix.position.copy(pool[index].position);
    matrix.scale.setScalar(size);
    matrix.updateMatrix(); mesh.setMatrixAt(index, matrix.matrix);
  }

  for (let i = 0; i < p.poolSize; i++) write(i, 0);
  scene.add(mesh);

  return {
    mesh,
    burst(position: Vector3): void {
      for (let i = 0; i < p.perBurst; i++) {
        const bubble = pool[next];
        next = (next + 1) % p.poolSize;
        const angle = random.range(0, Math.PI * 2), speed = random.range(0.3, 1) * p.spread;
        bubble.position.copy(position);
        bubble.velocity.set(Math.cos(angle) * speed, p.rise * random.range(0.6, 1.2), Math.sin(angle) * speed * 0.5);
        bubble.age = 0;
      }
    },
    update(time: number): void {
      const dt = lastTime === undefined ? 0 : Math.max(0, time - lastTime);
      lastTime = time;
      pool.forEach((bubble, index) => write(index, advanceSplashBubble(bubble, dt)));
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose(): void { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}

export type Splash = ReturnType<typeof createSplash>;
