import { Color, DirectionalLight, Fog, HemisphereLight } from 'three';
import type { Scene } from 'three';
import { LIGHTING_PARAMS } from '../../config/params';
import { PALETTE } from '../../config/palette';
import type { EnvironmentContext, EnvironmentModule } from './types';

export function createLighting(scene: Scene, _ctx: EnvironmentContext): EnvironmentModule {
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const background = new Color(PALETTE.fog);
  const fog = new Fog(PALETTE.fog, LIGHTING_PARAMS.fogNear, LIGHTING_PARAMS.fogFar);
  scene.background = background;
  scene.fog = fog;
  const hemisphere = new HemisphereLight(PALETTE.lightSky, PALETTE.lightGround, LIGHTING_PARAMS.hemisphereIntensity);
  const sun = new DirectionalLight(PALETTE.lightSun, LIGHTING_PARAMS.directionalIntensity);
  const p = LIGHTING_PARAMS.directionalPosition;
  sun.position.set(p.x, p.y, p.z);
  scene.add(hemisphere, sun);
  return {
    update(_time) {},
    dispose() {
      scene.remove(hemisphere, sun);
      hemisphere.dispose();
      sun.dispose();
      if (scene.background === background) scene.background = previousBackground;
      if (scene.fog === fog) scene.fog = previousFog;
    },
  };
}
