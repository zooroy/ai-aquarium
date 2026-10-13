import { CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import type { Scene } from 'three';
import { DECOR_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { GroundContext } from './types';
import { createDecorations } from './placement';

export function createCoral(scene: Scene, ctx: GroundContext) {
  return createDecorations(scene, ctx, p.coral, (index) => {
    const root = new Group(); root.name = 'coral';
    for (let i = 0; i < p.coralBranches; i++) {
      const height = p.coralHeight * ctx.random.range(0.6, 1);
      const geometry = new CylinderGeometry(p.coralRadius / 2, p.coralRadius, height, p.coralSegments);
      geometry.translate(0, height / 2, 0);
      const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: PALETTE.coral[index % PALETTE.coral.length], flatShading: true }));
      mesh.rotation.z = i === 0 ? 0 : ctx.random.range(-p.coralSpread, p.coralSpread);
      mesh.rotation.y = ctx.random.range(0, Math.PI * 2);
      mesh.position.y = i === 0 ? 0 : p.coralHeight * (i / p.coralBranches) / 2;
      root.add(mesh);
    }
    return root;
  });
}
