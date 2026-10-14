import { BufferGeometry, Float32BufferAttribute } from 'three';
import { fishVertexData, xyToUv } from '../../drawing/fish-template';

/** color 是 body/fins/belly 的 one-hot 權重，渲染器再轉成配色 RGB。 */
export function createFishGeometry(): BufferGeometry {
  const { positions, colors } = fishVertexData();
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const point = xyToUv(positions[i], positions[i + 1]); uv.push(point.u, point.v);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
