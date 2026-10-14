import { Vector3 } from 'three';
import { FISH_PARAMS, FISH_RENDER_PARAMS, GRAB_PARAMS as p } from '../config/params';
import type { TankBounds } from '../core/tank-bounds';
import type { InputState } from '../input/types';
import type { Fish } from './fish-state';

export interface GrabContext {
  bounds: TankBounds;
  aspect: number; // 視窗寬／高，將 y 距離換算為畫面寬度比例。
  projectToScreen: (position: Vector3) => { x: number; y: number };
  screenToWorld: (x: number, y: number, z: number) => Vector3;
}

/** 主迴圈先呼叫 update，再 stepSchool；controller 不持有相機或渲染物件。 */
export class GrabController {
  private previous = new Map<string, boolean>();
  private held: { fish: Fish; pointerId: string; x: number; y: number } | undefined;

  update(state: InputState, fish: Fish[], dt: number, ctx: GrabContext): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Expected finite nonnegative dt');
    if (!Number.isFinite(ctx.aspect) || ctx.aspect <= 0) throw new RangeError('Expected positive finite aspect');
    if (this.held && (!fish.includes(this.held.fish) || this.held.fish.mode !== 'grabbed')) this.held = undefined;
    if (this.held) {
      const owner = state.pointers.find((pointer) => pointer.id === this.held!.pointerId);
      if (!owner?.pressed) {
        const held = this.held;
        const pointer = owner ?? held;
        const origin = ctx.screenToWorld(pointer.x, pointer.y, p.holdZ);
        const direction = new Vector3(held.fish.position.x - origin.x, held.fish.position.y - origin.y, 0);
        if (direction.lengthSq() < 1e-12) direction.set(-held.fish.forward.x, -held.fish.forward.y, 0);
        if (direction.lengthSq() < 1e-12) direction.set(1, 0, 0);
        const pitch = Math.max(-FISH_PARAMS.maxPitch, Math.min(FISH_PARAMS.maxPitch,
          Math.atan2(direction.y, Math.abs(direction.x))));
        // 逃走保持在 world xy 平面；幾乎垂直時沿原朝向選擇左右，無 x 朝向則固定向右。
        const horizontalSign = Math.abs(direction.x) > 1e-6
          ? Math.sign(direction.x) : (held.fish.forward.x < 0 ? -1 : 1);
        direction.set(horizontalSign * Math.cos(pitch), Math.sin(pitch), 0);
        held.fish.velocity.copy(direction).multiplyScalar(FISH_PARAMS.maxSpeed * p.fleeSpeedMultiplier);
        held.fish.forward.copy(direction);
        held.fish.mode = 'fleeing'; held.fish.fleeTime = 0; held.fish.panic = 1;
        this.held = undefined;
      }
    }
    if (!this.held && !fish.some((item) => item.mode === 'grabbed')) {
      for (const pointer of state.pointers) {
        if (!pointer.pressed || this.previous.get(pointer.id)) continue;
        let nearest: Fish | undefined;
        let distance = Infinity;
        for (const item of fish) {
          if (item.mode !== 'swimming' && item.mode !== 'fleeing') continue;
          const screen = ctx.projectToScreen(item.position);
          const candidate = Math.hypot(screen.x - pointer.x, (screen.y - pointer.y) / ctx.aspect);
          const end = ctx.projectToScreen(item.position.clone().add(new Vector3(FISH_RENDER_PARAMS.bodyLength * item.scale / 2, 0, 0)));
          const projectedHalfLength = Math.hypot(end.x - screen.x, (end.y - screen.y) / ctx.aspect);
          const hit = projectedHalfLength * p.hitScale + p.hitMargin;
          if (candidate < hit && candidate < distance) { nearest = item; distance = candidate; }
        }
        if (nearest) {
          nearest.mode = 'grabbed'; nearest.fleeTime = 0;
          this.held = { fish: nearest, pointerId: pointer.id, x: pointer.x, y: pointer.y };
          break;
        }
      }
    }
    if (this.held) {
      const pointer = state.pointers.find((item) => item.id === this.held!.pointerId)!;
      const item = this.held.fish;
      const target = ctx.screenToWorld(pointer.x, pointer.y, p.holdZ);
      const xy = 1 - Math.exp(-dt / p.followTimeXY), z = 1 - Math.exp(-dt / p.followTimeZ);
      item.position.x += (target.x - item.position.x) * xy;
      item.position.y += (target.y - item.position.y) * xy;
      item.position.z += (target.z - item.position.z) * z;
      for (const axis of ['x', 'y', 'z'] as const) item.position[axis] = Math.max(ctx.bounds.min[axis], Math.min(axis === 'z' ? Math.max(ctx.bounds.max.z, p.holdZ) : ctx.bounds.max[axis], item.position[axis]));
      item.panic = Math.min(1, item.panic + dt / p.panicRise);
      this.held.x = pointer.x; this.held.y = pointer.y;
    }
    this.previous = new Map(state.pointers.map((pointer) => [pointer.id, pointer.pressed]));
  }
}
