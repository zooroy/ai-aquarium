import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { FISH_RENDER_PARAMS as p } from '../../config/params';

/** color 是 body/fins/belly 的 one-hot 權重，渲染器再轉成配色 RGB。 */
export function createFishGeometry(): BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  function triangle(a: Vector3, b: Vector3, c: Vector3, region: number) {
    for (const v of [a, b, c]) { positions.push(v.x, v.y, v.z); colors.push(region === 0 ? 1 : 0, region === 1 ? 1 : 0, region === 2 ? 1 : 0); }
  }
  const rings = p.rings.map(([x, y, z]) => Array.from({ length: p.ringVertices }, (_, i) => {
    const angle = i * Math.PI * 2 / p.ringVertices;
    return new Vector3(x, Math.cos(angle) * y, Math.sin(angle) * z);
  }));
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < p.ringVertices; i++) {
      const j = (i + 1) % p.ringVertices;
      const a = rings[ring][i], b = rings[ring][j], c = rings[ring + 1][i], d = rings[ring + 1][j];
      const region = a.y + b.y < 0 ? 2 : 0;
      triangle(a, b, c, region); triangle(b, d, c, region);
    }
  }
  for (let i = 0; i < p.ringVertices; i++) {
    const j = (i + 1) % p.ringVertices;
    triangle(new Vector3(p.tailX, 0, 0), rings[0][j], rings[0][i], 0);
    triangle(new Vector3(p.headX, 0, 0), rings[rings.length - 1][i], rings[rings.length - 1][j], 0);
  }
  // 三角柱鰭：兩個三角端面、六個側面三角形，保留立體厚度。
  function fin(points: readonly (readonly number[])[], mirror = 1) {
    const base = points.map(([x, y, z]) => new Vector3(x, y, z * mirror));
    const normal = base[1].clone().sub(base[0]).cross(base[2].clone().sub(base[0])).normalize().multiplyScalar(p.finThickness / 2);
    const front = base.map((v) => v.clone().add(normal)), back = base.map((v) => v.clone().sub(normal));
    triangle(front[0], front[1], front[2], 1); triangle(back[2], back[1], back[0], 1);
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; triangle(front[i], back[i], front[j], 1); triangle(front[j], back[i], back[j], 1); }
  }
  fin(p.tailFin); fin(p.dorsalFin); fin(p.pectoralFin); fin(p.pectoralFin, -1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
