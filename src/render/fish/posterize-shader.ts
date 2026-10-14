import type { Material } from 'three';
import { CUSTOM_FISH_PARAMS as p } from '../../config/params';

/** Patch after map sampling, before Lambert lighting. Preserve any earlier vertex patch. */
export function applyPosterizeShader(material: Material) {
  const uniforms = { uPosterizeLevels: { value: p.levels }, uPosterizeStrength: { value: p.strength } };
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = 'uniform float uPosterizeLevels, uPosterizeStrength;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        vec3 orig = diffuseColor.rgb;
        float steps = max(uPosterizeLevels - 1.0, 1.0);
        vec3 quantized = floor(orig * steps + 0.5) / steps;
        diffuseColor.rgb = mix(orig, quantized, uPosterizeStrength);
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${key}|aquarium-posterize-v1`;
  material.needsUpdate = true;
  return { uniforms };
}
