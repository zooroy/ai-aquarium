import { Mesh, Scene, ShaderLib, UniformsUtils } from 'three';
import type { MeshLambertMaterial, WebGLRenderer, WebGLProgramParametersWithUniforms } from 'three';
import { expect, it } from 'vitest';
import { createRandom } from '../../../src/core/random';
import { createSand } from '../../../src/render/environment/sand';
import { createCaustics } from '../../../src/render/environment/caustics';
import { createSeaweed } from '../../../src/render/environment/seaweed';

const makeContext = () => ({ random: createRandom(42), getBounds: () => bounds, getHeight: () => -4 });
const bounds = { min: { x: -5, y: -4, z: -8 }, max: { x: 5, y: 4, z: 3 } };
function compile(material: MeshLambertMaterial) {
  const shader = { vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader, uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms) } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}
it('injects two caustic layers and updates time without rebuilding material', () => {
  const scene = new Scene(), ctx = makeContext();
  const sand = createSand(scene, ctx);
  const previous = sand.mesh.material.onBeforeCompile;
  const caustics = createCaustics(scene, { ...ctx, sand });
  const shader = compile(sand.mesh.material);
  expect(shader.vertexShader).toContain('vSandXZ = position.xz');
  expect(shader.fragmentShader).toContain('outgoingLight +=');
  expect(shader.fragmentShader).toContain('abs(b)');
  caustics.update(2);
  expect(shader.uniforms.uCausticsTime.value).toBe(2);
  caustics.dispose(); expect(sand.mesh.material.onBeforeCompile).toBe(previous);
  sand.dispose();
});
it('anchors seaweed at y=0 and drives all material times from update', () => {
  const scene = new Scene();
  const weed = createSeaweed(scene, makeContext());
  const shaders: WebGLProgramParametersWithUniforms[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) shaders.push(compile(object.material as MeshLambertMaterial));
  });
  weed.update(2);
  for (const shader of shaders) {
    expect(shader.vertexShader).toContain('position.y / uWeedHeight');
    expect(shader.vertexShader).toContain('tip * tip');
    expect(shader.uniforms.uWeedTime.value).toBe(2);
  }
  weed.dispose();
});
