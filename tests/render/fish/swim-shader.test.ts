import { MeshLambertMaterial, ShaderLib, UniformsUtils } from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { applySwimShader } from '../../../src/render/fish/swim-shader';

it.each([false, true])('patches shader for instancing=%s with attributes or uniform defaults', (instanced) => {
  const material = new MeshLambertMaterial();
  const previous = vi.fn(); material.onBeforeCompile = previous;
  const key = material.customProgramCacheKey();
  const patch = applySwimShader(material, { bodyLength: 2, headX: 1 });
  const shader = { vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader, uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms) } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  expect(previous).toHaveBeenCalledOnce();
  // 模擬 USE_INSTANCING 分支選擇，檢查一般 Mesh 不會引用 instance attribute。
  const selected = shader.vertexShader.replace(/#ifdef USE_INSTANCING\s*([\s\S]*?)#else\s*([\s\S]*?)#endif/g, (_, yes: string, no: string) => instanced ? yes : no);
  expect(selected).toContain(instanced ? 'attribute float aSwimPhase' : 'uniform float uSwimPhase');
  if (!instanced) expect(selected).not.toContain('aSwim');
  expect(selected).toContain('swimT * swimT');
  expect(selected).toContain('transformed.z +=');
  expect(shader.uniforms.uSwimBodyLength.value).toBe(2);
  expect(shader.uniforms.uSwimHeadX.value).toBe(1);
  expect(shader.uniforms.uSwimAmp.value).toBe(1);
  patch.uniforms.uTime.value = 5;
  expect(shader.uniforms.uTime.value).toBe(5);
  expect(material.customProgramCacheKey()).not.toBe(key);
  material.dispose();
});
