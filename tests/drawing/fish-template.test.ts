import { expect, it } from 'vitest';
import { FRAME, fishSilhouetteTriangles, xyToUv } from '../../src/drawing/fish-template';
import { createFishGeometry } from '../../src/render/fish/fish-geometry';
import { CUSTOM_FISH_PARAMS as p } from '../../src/config/params';

it('derives padded bounds from geometry and maps every vertex inside the texture', () => {
  const geometry = createFishGeometry(), positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const box = geometry.boundingBox!;
  expect(FRAME.minX).toBeCloseTo(box.min.x - p.frameMargin);
  expect(FRAME.maxX).toBeCloseTo(box.max.x + p.frameMargin);
  expect(FRAME.minY).toBeCloseTo(box.min.y - p.frameMargin);
  expect(FRAME.maxY).toBeCloseTo(box.max.y + p.frameMargin);
  expect(uv.count).toBe(positions.count);
  let maxV = 0, dorsalV = 0;
  for(let i=0;i<positions.count;i++) {
    const expected = xyToUv(positions.getX(i), positions.getY(i));
    expect(uv.getX(i)).toBeCloseTo(expected.u);
    expect(uv.getY(i)).toBeCloseTo(expected.v);
    for(const value of [uv.getX(i),uv.getY(i)]) {expect(value).toBeGreaterThan(0);expect(value).toBeLessThan(1);}
    maxV = Math.max(maxV, uv.getY(i));
    if(positions.getY(i) === box.max.y) dorsalV = uv.getY(i);
  }
  expect(dorsalV).toBe(maxV);
  expect(xyToUv(box.max.x,0).u).toBeGreaterThan(xyToUv(box.min.x,0).u);
  // Side counterparts share xy coordinates but have opposite z.
  let pairs = 0;
  for(let i=0;i<positions.count;i++) for(let j=i+1;j<positions.count;j++) {
    if(positions.getZ(i) > .001 && Math.abs(positions.getZ(i)+positions.getZ(j))<1e-7 &&
       Math.abs(positions.getX(i)-positions.getX(j))<1e-7 && Math.abs(positions.getY(i)-positions.getY(j))<1e-7) {
      expect(uv.getX(i)).toBeCloseTo(uv.getX(j));expect(uv.getY(i)).toBeCloseTo(uv.getY(j));pairs++;
    }
  }
  expect(pairs).toBeGreaterThan(0);geometry.dispose();
});
it('projects the same triangles as the mesh with positive total area',()=>{
  const geometry=createFishGeometry(),uv=geometry.getAttribute('uv'),triangles=fishSilhouetteTriangles();
  expect(triangles).toHaveLength(uv.count/3);
  let area=0;
  triangles.forEach(([a,b,c],i)=>{
    [a,b,c].forEach((point,j)=>{
      expect(point.u).toBeCloseTo(uv.getX(i*3+j));expect(point.v).toBeCloseTo(uv.getY(i*3+j));
      for(const value of [point.u,point.v]) {expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
    });
    area+=Math.abs((b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u))/2;
  });
  expect(area).toBeGreaterThan(0);geometry.dispose();
});
