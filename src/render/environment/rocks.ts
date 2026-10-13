import { Group, IcosahedronGeometry, Mesh, MeshLambertMaterial } from 'three';
import type { Scene } from 'three';
import { DECOR_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { GroundContext } from './types';
import { createDecorations } from './placement';

export function createRocks(scene: Scene, ctx: GroundContext) {
  return createDecorations(scene, ctx, p.rocks, (index) => {
    const geometry = new IcosahedronGeometry(1, 0);
    const positions = geometry.getAttribute('position');
    const offsets = new Map<string, number>();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const key = `${x},${y},${z}`;
      if (!offsets.has(key)) offsets.set(key, ctx.random.range(1 - p.rockJitter, 1 + p.rockJitter));
      const scale = offsets.get(key)!;
      positions.setXYZ(i, x * scale, y * scale, z * scale);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.translate(0, -geometry.boundingBox!.min.y, 0);
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: PALETTE.rocks[index % PALETTE.rocks.length], flatShading: true }));
    mesh.scale.set(ctx.random.range(p.rockMinScale, p.rockMaxScale), ctx.random.range(p.rockMinScale, p.rockMaxScale), ctx.random.range(p.rockMinScale, p.rockMaxScale));
    mesh.rotation.y = ctx.random.range(0, Math.PI * 2);
    const root = new Group(); root.name = 'rock'; root.add(mesh); return root;
  });
}
