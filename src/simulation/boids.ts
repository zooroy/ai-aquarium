import { Vector3 } from 'three';
import { createNoise3D } from 'simplex-noise';
import { FISH_PARAMS as params, GRAB_PARAMS } from '../config/params';
import { createRandom } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';
import type { Pointer } from '../input/types';
import { isTransitioning } from './fish-state';
import type { Fish } from './fish-state';
import { SpatialGrid } from './spatial-grid';
import { computeAvoidanceForce } from './cursor-avoidance';

const noise = createNoise3D(createRandom(params.wanderSeed).next);

export function stepSchool(fish: Fish[], dt: number, ctx: {
  bounds: TankBounds;
  time: number;
  pointers: readonly Pointer[];
  projectToScreen: (p: Vector3) => { x: number; y: number };
}): void {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Expected finite nonnegative dt');
  if (dt === 0) return;
  const grid = new SpatialGrid();
  grid.rebuild(fish);
  // 先計算全部力再更新，避免陣列順序影響鄰居狀態。
  const forces = fish.map((item) => {
    if (item.mode === 'grabbed' || isTransitioning(item)) return new Vector3();
    const separation = new Vector3();
    const alignment = new Vector3();
    const center = new Vector3();
    let count = 0;
    const neighbors = grid.queryNeighbors(item.position, params.perceptionRadius)
      .filter((neighbor) => neighbor !== item && !isTransitioning(neighbor))
      .sort((a, b) => item.position.distanceToSquared(a.position) - item.position.distanceToSquared(b.position) || a.id - b.id);
    for (const neighbor of neighbors) {
      const delta = item.position.clone().sub(neighbor.position);
      const distance = delta.length();
      if (distance < params.separationRadius) {
        if (distance > 0) separation.addScaledVector(delta, (1 - distance / params.separationRadius) / distance);
        else separation.x += item.id < neighbor.id ? -1 : 1;
      }
      if (neighbor.mode !== 'grabbed' && count < params.maxNeighbors) {
        alignment.add(neighbor.velocity.clone().normalize());
        center.add(neighbor.position);
        count++;
      }
    }
    const force = new Vector3();
    separation.multiplyScalar(params.separationWeight);
    if (count > 0) {
      alignment.divideScalar(count).multiplyScalar(params.maxSpeed).sub(item.velocity);
      center.divideScalar(count).sub(item.position);
      force.addScaledVector(alignment, params.alignmentWeight);
      force.addScaledVector(center, params.cohesionWeight);
    }
    const t = ctx.time * params.wanderFrequency;
    const wander = new Vector3(
      noise(item.phase, t, 0), noise(item.phase, t, 1), noise(item.phase, t, 2),
    );
    force.addScaledVector(wander, params.wanderStrength * params.wanderWeight);
    for (const axis of ['x', 'y', 'z'] as const) {
      const low = Math.max(0, 1 - (item.position[axis] - ctx.bounds.min[axis]) / params.boundaryAvoidanceRadius);
      const high = Math.max(0, 1 - (ctx.bounds.max[axis] - item.position[axis]) / params.boundaryAvoidanceRadius);
      force[axis] += (low - high) * params.boundaryWeight;
    }
    const avoidance = computeAvoidanceForce(item, ctx.pointers, ctx.projectToScreen).multiplyScalar(params.cursorAvoidanceWeight);
    // 分離先保留額度，其他力只能使用剩餘額度，避免聚合抵消避碰。
    separation.clampLength(0, params.maxSteeringForce);
    force.clampLength(0, params.maxSteeringForce - separation.length());
    return separation.add(force).add(avoidance).clampLength(0, params.maxSteeringForce);
  });

  fish.forEach((item, index) => {
    if (item.mode === 'grabbed' || isTransitioning(item)) return;
    let maxSpeed = params.maxSpeed as number;
    if (item.mode === 'fleeing') {
      item.fleeTime = Math.min(GRAB_PARAMS.fleeDuration, item.fleeTime + dt);
      const remaining = 1 - item.fleeTime / GRAB_PARAMS.fleeDuration;
      maxSpeed *= 1 + (GRAB_PARAMS.fleeSpeedMultiplier - 1) * remaining;
      item.panic = remaining;
      if (remaining <= 1e-12) { item.mode = 'swimming'; item.panic = 0; }
    }
    item.velocity.addScaledVector(forces[index], dt);
    if (item.velocity.lengthSq() === 0) item.velocity.copy(item.forward).multiplyScalar(params.minSpeed);
    item.velocity.clampLength(params.minSpeed, maxSpeed);
    const speed = item.velocity.length();
    const horizontal = Math.hypot(item.velocity.x, item.velocity.z);
    const yaw = horizontal > 1e-12 ? Math.atan2(item.velocity.z, item.velocity.x) : Math.atan2(item.forward.z, item.forward.x);
    const pitch = Math.max(-params.maxPitch, Math.min(params.maxPitch, Math.atan2(item.velocity.y, horizontal)));
    item.velocity.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)).multiplyScalar(speed);
    // yaw/pitch 插值不會像跨半球 slerp 一樣經過垂直極點。
    const oldPitch = Math.asin(Math.max(-1, Math.min(1, item.forward.y)));
    const oldYaw = Math.atan2(item.forward.z, item.forward.x);
    const yawDelta = Math.atan2(Math.sin(yaw - oldYaw), Math.cos(yaw - oldYaw));
    const pitchDelta = pitch - oldPitch;
    const travel = Math.hypot(yawDelta, pitchDelta);
    const fraction = Math.min(1 - Math.exp(-params.orientationResponse * dt), travel > 0 ? params.maxTurnAngle / travel : 1);
    let nextYaw = oldYaw + yawDelta * fraction;
    let nextPitch = oldPitch + pitchDelta * fraction;
    if (Math.abs(oldPitch) > params.maxPitch) {
      // 舊狀態／球面初始化可能超限：最多三幀恢復，仍遵守每幀 30 度。
      const targetPitch = Math.max(-params.maxPitch, Math.min(params.maxPitch, oldPitch));
      nextPitch = oldPitch + Math.max(-params.maxTurnAngle, Math.min(params.maxTurnAngle, targetPitch - oldPitch));
      nextYaw = oldYaw;
    }
    item.forward.set(Math.cos(nextYaw) * Math.cos(nextPitch), Math.sin(nextPitch), Math.sin(nextYaw) * Math.cos(nextPitch));
    item.position.addScaledVector(item.velocity, dt);
    // 最後一道保險，不反轉速度；正常轉向由軟邊界力完成。
    for (const axis of ['x', 'y', 'z'] as const) {
      item.position[axis] = Math.max(ctx.bounds.min[axis], Math.min(ctx.bounds.max[axis], item.position[axis]));
    }
  });
}
