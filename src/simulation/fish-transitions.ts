import { Vector3 } from 'three';
import { CUSTOM_FISH_PARAMS as p, FISH_PARAMS } from '../config/params';
import type { Random } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';
import type { Fish } from './fish-state';

export interface TransitionContext {
  /** Visible half width of the screen at depth z (world units). */
  visibleHalfWidth(z: number): number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function setForward(fish: Fish, horizontal: Vector3, pitch: number): void {
  fish.forward.set(horizontal.x * Math.cos(pitch), Math.sin(pitch), horizontal.z * Math.cos(pitch));
}

/** A new custom fish starting just above the screen's top edge; it falls to the upper third, then swims. */
export function spawnDroppingFish(
  record: { id: string }, bounds: TankBounds, random: Random, nextId: number, visibleTop: (z: number) => number,
): Fish {
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const halfSpread = (bounds.max.x - bounds.min.x) * p.dropSpreadX / 2;
  const midZ = (bounds.min.z + bounds.max.z) / 2;
  const x = centerX + random.range(-halfSpread, halfSpread);
  const z = random.range(midZ, Math.max(midZ, bounds.max.z - p.dropFrontInset));
  const startY = visibleTop(z) + p.dropStartMargin;
  const targetY = bounds.max.y - (bounds.max.y - bounds.min.y) * p.dropTargetRatio;
  const angle = random.range(0, Math.PI * 2);
  const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const fish: Fish = {
    id: nextId, customId: record.id, position: new Vector3(x, startY, z), forward: new Vector3(),
    velocity: new Vector3(), variant: -1, scale: p.scale, phase: random.range(0, Math.PI * 2),
    mode: 'dropping', panic: 0, fleeTime: 0,
    transition: { elapsed: 0, startY, targetY, direction },
  };
  setForward(fish, direction, -p.dropPitch);
  return fish;
}

/** Eases y from startY to targetY over dropDuration, levelling the head; then hands over to the school. */
export function stepDropping(fish: Fish, dt: number): void {
  const transition = fish.transition;
  if (fish.mode !== 'dropping' || !transition) return;
  transition.elapsed += dt;
  // The tolerance absorbs float drift from summing fixed frame steps.
  const t = Math.min(1, transition.elapsed / p.dropDuration + 1e-9);
  const previousY = fish.position.y;
  fish.position.y = transition.startY + (transition.targetY - transition.startY) * easeOutCubic(t);
  setForward(fish, transition.direction, -p.dropPitch * (1 - t));
  fish.velocity.set(0, dt > 0 ? (fish.position.y - previousY) / dt : 0, 0);
  if (t >= 1) {
    fish.mode = 'swimming';
    fish.velocity.copy(transition.direction).multiplyScalar(FISH_PARAMS.maxSpeed);
    fish.transition = undefined;
  }
}

/** Sends a fish out through the nearest side wall; a grabbed fish is let go because its mode changes. */
export function startLeaving(fish: Fish): void {
  const side = Math.sign(fish.position.x) || 1;
  fish.mode = 'leaving'; fish.panic = 0; fish.fleeTime = 0;
  fish.transition = { elapsed: 0, startY: fish.position.y, targetY: fish.position.y, direction: new Vector3(side, 0, 0) };
}

/** Returns true once the fish is past the visible side edge (or the safety timeout ran out). */
export function stepLeaving(fish: Fish, dt: number, ctx: TransitionContext): boolean {
  const transition = fish.transition;
  if (fish.mode !== 'leaving' || !transition) return false;
  transition.elapsed += dt;
  fish.velocity.copy(transition.direction).multiplyScalar(FISH_PARAMS.maxSpeed * p.leaveSpeedMultiplier);
  fish.position.addScaledVector(fish.velocity, dt);
  const blend = 1 - Math.exp(-FISH_PARAMS.orientationResponse * dt);
  fish.forward.lerp(transition.direction, blend);
  if (fish.forward.lengthSq() < 1e-12) fish.forward.copy(transition.direction);
  fish.forward.normalize();
  return Math.abs(fish.position.x) > ctx.visibleHalfWidth(fish.position.z) + p.leaveMargin
    || transition.elapsed > p.leaveTimeout;
}

/** Steps every dropping/leaving fish; returns the customIds that have finished leaving. */
export function stepTransitions(fish: readonly Fish[], dt: number, ctx: TransitionContext): string[] {
  const gone: string[] = [];
  for (const item of fish) {
    if (item.mode === 'dropping') stepDropping(item, dt);
    else if (item.mode === 'leaving' && stepLeaving(item, dt, ctx) && item.customId !== undefined) gone.push(item.customId);
  }
  return gone;
}

/** The first id (oldest first) still in the tank and not already leaving. */
export function chooseFishToRetire(oldestFirstIds: Iterable<string>, fish: readonly Fish[]): string | undefined {
  const present = new Map<string, Fish>();
  for (const item of fish) if (item.customId !== undefined) present.set(item.customId, item);
  for (const id of oldestFirstIds) {
    const item = present.get(id);
    if (item && item.mode !== 'leaving') return id;
  }
  return undefined;
}
