import { Mesh, MeshLambertMaterial, Scene, ShaderLib, SRGBColorSpace, Texture, UniformsUtils } from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { expect,it,vi } from 'vitest';
import { CustomFishRenderer } from '../../../src/render/fish/custom-fish-renderer';
import { computeSwimPose } from '../../../src/render/fish/swim-pose';
import { spawnCustomFish } from '../../../src/simulation/custom-fish';
import { createRandom } from '../../../src/core/random';
import { CUSTOM_FISH_PARAMS } from '../../../src/config/params';
const bounds={min:{x:-2,y:-2,z:-2},max:{x:2,y:2,z:2}};
const compile=(material:MeshLambertMaterial)=>{
  const shader={vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader,
    uniforms:UniformsUtils.clone(ShaderLib.lambert.uniforms)} as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader,{} as WebGLRenderer);return shader;
};
it('shares UV geometry, uses separate sRGB materials and syncs only registered custom ids',()=>{
  const scene=new Scene(),renderer=new CustomFishRenderer(scene),a=new Texture(),b=new Texture();
  renderer.add('a',a);renderer.add('b',b);
  const [ma,mb]=scene.children as Mesh<ReturnType<typeof import('../../../src/render/fish/fish-geometry').createFishGeometry>,MeshLambertMaterial>[];
  expect(ma.geometry).toBe(mb.geometry);expect(ma.geometry.getAttribute('uv')).toBeDefined();
  expect(ma.material).not.toBe(mb.material);expect(ma.material.flatShading).toBe(true);
  expect(a.colorSpace).toBe(SRGBColorSpace);expect(b.colorSpace).toBe(SRGBColorSpace);
  const shader=compile(ma.material),other=compile(mb.material);
  const fish=spawnCustomFish({id:'a'},bounds,createRandom(42),60);
  const normal={...fish,customId:undefined},unknown={...fish,customId:'unknown'};
  renderer.sync([normal,unknown],0);expect(ma.visible).toBe(false);expect(mb.visible).toBe(false);
  let yaw:number|undefined;
  for(const time of [1,1.1,1.2]) {
    fish.panic=time===1?0:1;fish.forward.set(Math.cos(time),0,Math.sin(time));
    const pose=computeSwimPose(fish,time,time===1?1:.1,yaw);yaw=pose.yaw;
    renderer.sync([fish,normal,unknown],time);
    ma.matrix.elements.forEach((v,i)=>expect(v).toBeCloseTo(pose.matrix.elements[i],10));
    expect(shader.uniforms.uTime.value).toBe(time);
    expect(shader.uniforms.uSwimPhase.value).toBe(pose.phase);
    expect(shader.uniforms.uSwimFreq.value).toBe(pose.frequency);
    expect(shader.uniforms.uSwimAmp.value).toBe(pose.amplitude);
    expect(other.uniforms.uTime.value).toBe(0);
    expect(ma.visible).toBe(true);expect(mb.visible).toBe(false);
  }
  expect(shader.vertexShader).toContain('transformed.z +=');
  expect(shader.vertexShader).toContain('float swimPhase = uSwimPhase');
  expect(shader.fragmentShader.indexOf('vec3 orig')).toBeGreaterThan(shader.fragmentShader.indexOf('#include <map_fragment>'));
  expect(shader.fragmentShader).toContain('mix(orig, quantized, uPosterizeStrength)');
  expect(shader.uniforms.uPosterizeLevels.value).toBe(CUSTOM_FISH_PARAMS.levels);
  expect(shader.uniforms.uPosterizeStrength.value).toBe(.6);
  expect(ma.material.customProgramCacheKey()).toContain('aquarium-swim-v1|aquarium-posterize-v1');
  renderer.dispose();
});
it('removes owned texture/material while retaining shared geometry until dispose',()=>{
  const scene=new Scene(),renderer=new CustomFishRenderer(scene),a=new Texture(),b=new Texture();
  renderer.add('a',a);renderer.add('b',b);
  const mesh=scene.children[0] as Mesh<never,MeshLambertMaterial>;
  const geometry=scene.children[1] as Mesh;
  const geometryDispose=vi.spyOn(geometry.geometry,'dispose'),materialDispose=vi.spyOn(mesh.material,'dispose');
  const aDispose=vi.spyOn(a,'dispose'),bDispose=vi.spyOn(b,'dispose');
  renderer.remove('a');renderer.remove('missing');
  expect(scene.children).toHaveLength(1);expect(aDispose).toHaveBeenCalledOnce();expect(materialDispose).toHaveBeenCalledOnce();
  expect(geometryDispose).not.toHaveBeenCalled();expect(bDispose).not.toHaveBeenCalled();
  renderer.dispose();expect(geometryDispose).toHaveBeenCalledOnce();expect(bDispose).toHaveBeenCalledOnce();
  expect(scene.children).toHaveLength(0);
});
