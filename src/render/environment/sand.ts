import { Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { BufferGeometry, Scene } from 'three';
import { createNoise2D } from 'simplex-noise';
import { SAND_PARAMS, TANK_PARAMS } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { TankBounds } from '../../core/tank-bounds';
import type { EnvironmentContext, EnvironmentModule } from './types';

export interface SandModule extends EnvironmentModule {
  mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  getHeight(x: number, z: number): number;
}

export function createSand(scene: Scene, ctx: EnvironmentContext): SandModule {
  const noise = createNoise2D(ctx.random.next);
  function geometryFor(bounds: TankBounds) {
    const farZ = bounds.min.z - SAND_PARAMS.farExtension;
    const nearZ = bounds.max.z + SAND_PARAMS.nearExtension;
    // 最遠處視錐較寬，以遠端 z 的可視寬度鋪滿整片沙地。
    const depthRatio = (TANK_PARAMS.cameraPosition.z - farZ) / TANK_PARAMS.cameraPosition.z;
    const width = (bounds.max.x - bounds.min.x) / TANK_PARAMS.visibleAreaRatio * depthRatio * SAND_PARAMS.widthPadding;
    const plane = new PlaneGeometry(width, nearZ - farZ, SAND_PARAMS.widthSegments, SAND_PARAMS.depthSegments);
    plane.rotateX(-Math.PI / 2);
    plane.translate(0, 0, (nearZ + farZ) / 2);
    const positions = plane.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const height = noise(positions.getX(i) * SAND_PARAMS.noiseFrequency, positions.getZ(i) * SAND_PARAMS.noiseFrequency);
      positions.setY(i, bounds.min.y - SAND_PARAMS.bottomOffset + height * SAND_PARAMS.heightAmplitude);
    }
    const geometry = plane.toNonIndexed();
    plane.dispose();
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
  let bounds = ctx.getBounds();
  const material = new MeshLambertMaterial({ color: PALETTE.sand, flatShading: true });
  const mesh = new Mesh(geometryFor(bounds), material);
  mesh.name = 'sand';
  scene.add(mesh);
  return {
    mesh,
    getHeight(x, z) {
      // 對實際三角面插值，裝飾根部與低面數沙地一致。
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 3) {
        const ax = positions.getX(i), az = positions.getZ(i);
        const bx = positions.getX(i + 1), bz = positions.getZ(i + 1);
        const cx = positions.getX(i + 2), cz = positions.getZ(i + 2);
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) {
          return a * positions.getY(i) + b * positions.getY(i + 1) + (1 - a - b) * positions.getY(i + 2);
        }
      }
      return ctx.getBounds().min.y - SAND_PARAMS.bottomOffset;
    },
    update(_time) {
      const next = ctx.getBounds();
      if (next === bounds) return;
      const geometry = geometryFor(next);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      bounds = next;
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
