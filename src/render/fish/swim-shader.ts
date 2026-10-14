import type { Material } from 'three';
import { FISH_RENDER_PARAMS as p } from '../../config/params';

export function applySwimShader(material: Material, options?: { bodyLength?: number; headX?: number }) {
  const uniforms: Record<'uTime' | 'uSwimBodyLength' | 'uSwimHeadX' | 'uSwimBaseAmp' | 'uSwimWaveK' | 'uSwimPhase' | 'uSwimFreq' | 'uSwimAmp', { value: number }> = {
    uTime: { value: 0 }, uSwimBodyLength: { value: options?.bodyLength ?? p.bodyLength },
    uSwimHeadX: { value: options?.headX ?? p.headX }, uSwimBaseAmp: { value: p.baseAmp },
    uSwimWaveK: { value: p.waveK }, uSwimPhase: { value: p.defaultPhase },
    uSwimFreq: { value: p.minFreq }, uSwimAmp: { value: p.defaultAmp },
  };
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float uTime, uSwimBodyLength, uSwimHeadX, uSwimBaseAmp, uSwimWaveK;
      #ifdef USE_INSTANCING
        attribute float aSwimPhase;
        attribute float aSwimFreq;
        attribute float aSwimAmp;
      #else
        uniform float uSwimPhase, uSwimFreq, uSwimAmp;
      #endif
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        float swimPhase = aSwimPhase, swimFreq = aSwimFreq, swimAmp = aSwimAmp;
      #else
        float swimPhase = uSwimPhase, swimFreq = uSwimFreq, swimAmp = uSwimAmp;
      #endif
      float swimT = clamp((uSwimHeadX - position.x) / uSwimBodyLength, 0.0, 1.0);
      transformed.z += sin(position.x * uSwimWaveK - uTime * swimFreq + swimPhase)
        * uSwimBaseAmp * swimAmp * swimT * swimT;
    `);
  };
  material.customProgramCacheKey = () => `${previousKey}|aquarium-swim-v1`;
  material.needsUpdate = true;
  return { uniforms };
}
