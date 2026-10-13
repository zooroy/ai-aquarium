import type { Scene } from 'three';
import { CAUSTICS_PARAMS as p } from '../../config/params';
import type { EnvironmentContext, EnvironmentModule } from './types';
import type { SandModule } from './sand';

export function createCaustics(_scene: Scene, ctx: EnvironmentContext & { sand: SandModule }): EnvironmentModule {
  const material = ctx.sand.mesh.material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const time = { value: 0 };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, { uCausticsTime: time, uCausticsIntensity: { value: p.intensity }, uCausticsScale: { value: p.scale }, uCausticsSpeed: { value: p.speed }, uCausticsSharpness: { value: p.sharpness } });
    shader.vertexShader = 'varying vec2 vSandXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandXZ = position.xz;');
    shader.fragmentShader = 'varying vec2 vSandXZ;\nuniform float uCausticsTime, uCausticsIntensity, uCausticsScale, uCausticsSpeed, uCausticsSharpness;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 q = vSandXZ * uCausticsScale;
      float t = uCausticsTime * uCausticsSpeed;
      float a = sin(q.x + sin(q.y + t)) * sin(q.y - t);
      float b = sin(q.x * 0.73 - t + sin(q.y * 0.81)) * sin(q.y * 0.87 + t);
      float net = pow(1.0 - abs(a), uCausticsSharpness) + pow(1.0 - abs(b), uCausticsSharpness);
      outgoingLight += diffuseColor.rgb * net * uCausticsIntensity;
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'aquarium-caustics-v1';
  material.needsUpdate = true;
  return { update(value) { time.value = value; }, dispose() {
    material.onBeforeCompile = previous; material.customProgramCacheKey = previousKey; material.needsUpdate = true;
  } };
}
