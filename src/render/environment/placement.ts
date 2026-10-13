import { Group, Mesh } from 'three';
import type { Scene } from 'three';
import { DECOR_PARAMS, TANK_PARAMS } from '../../config/params';
import type { GroundContext, EnvironmentModule } from './types';

/** 交錯前後景與左右側，中央留給魚群；resize 保留隨機取樣。 */
export function createDecorations(scene: Scene, ctx: GroundContext, count: number,
  make: (index: number) => Group, animate: (time: number) => void = () => {}): EnvironmentModule {
  const items = Array.from({ length: count }, (_, index) => {
    const root = make(index);
    const z = index % 2 === 0
      ? ctx.random.range(DECOR_PARAMS.frontMinZ, DECOR_PARAMS.frontMaxZ)
      : ctx.random.range(DECOR_PARAMS.backMinZ, DECOR_PARAMS.backMaxZ);
    const fraction = ctx.random.range(DECOR_PARAMS.sideMin, DECOR_PARAMS.sideMax) * (Math.floor(index / 2) % 2 ? -1 : 1);
    scene.add(root);
    return { root, z, fraction };
  });
  let lastBounds: ReturnType<GroundContext['getBounds']> | undefined;
  function update(time: number) {
    const bounds = ctx.getBounds();
    if (bounds !== lastBounds) {
      for (const item of items) {
        const x = bounds.max.x * (TANK_PARAMS.cameraPosition.z - item.z) / TANK_PARAMS.cameraPosition.z * item.fraction;
        item.root.position.set(x, ctx.getHeight(x, item.z), item.z);
      }
      lastBounds = bounds;
    }
    animate(time);
  }
  update(0);
  return { update, dispose() {
    for (const { root } of items) {
      scene.remove(root);
      root.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
        }
      });
    }
  } };
}
