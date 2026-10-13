import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import type { Scene } from 'three';
import { DECOR_PARAMS as p } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { GroundContext } from './types';
import { createDecorations } from './placement';

export function createSeaweed(scene: Scene, ctx: GroundContext) {
  const time = { value: 0 };
  return createDecorations(scene, ctx, p.seaweed, (index) => {
    const height = ctx.random.range(p.weedMinHeight, p.weedMaxHeight);
    const phase = ctx.random.range(0, Math.PI * 2);
    const geometry = new BoxGeometry(p.weedWidth, height, p.weedDepth, 1, p.weedSegments, 1);
    geometry.translate(0, height / 2, 0);
    const material = new MeshLambertMaterial({ color: PALETTE.seaweed[index % PALETTE.seaweed.length], flatShading: true });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uWeedTime: time, uWeedHeight: { value: height }, uWeedPhase: { value: phase }, uWeedAmplitude: { value: p.weedAmplitude }, uWeedFrequency: { value: p.weedFrequency } });
      shader.vertexShader = 'uniform float uWeedTime, uWeedHeight, uWeedPhase, uWeedAmplitude, uWeedFrequency;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float tip = clamp(position.y / uWeedHeight, 0.0, 1.0);
        transformed.x += sin(uWeedTime * uWeedFrequency + uWeedPhase + tip) * uWeedAmplitude * tip * tip;`);
    };
    material.customProgramCacheKey = () => 'aquarium-seaweed-v1';
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false; // shader 位移超出靜態 bounding box。
    const root = new Group(); root.name = 'seaweed'; root.add(mesh); return root;
  }, (value) => { time.value = value; });
}
