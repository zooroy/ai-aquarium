import { Vector3 } from 'three';
import { HAND_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import { handFrame } from './hand-rig';
import type { HandPose } from '../../input/hand/types';

/** joints 已由 provider 鏡像並翻轉 y，此處不可再翻一次。 */
export function transformHandJoints(pose: HandPose, target: Vector3): Vector3[] {
  const joints = pose.joints.map((joint) => new Vector3(joint.x, joint.y, joint.z).multiplyScalar(HAND_PARAMS.worldScale));
  if (joints.length !== 21) return [];
  const offset = target.clone().sub(joints[4].clone().add(joints[8]).multiplyScalar(0.5));
  return joints.map((joint) => joint.add(offset));
}
export interface HandBubble { position: Vector3; velocity: Vector3; age: number; }
export function advanceHandBubbles(bubbles: readonly HandBubble[], dt: number): HandBubble[] {
  return bubbles.map((bubble) => ({ position: bubble.position.clone().addScaledVector(bubble.velocity, Math.max(0, dt)), velocity: bubble.velocity.clone(), age: bubble.age + Math.max(0, dt) })).filter((bubble) => bubble.age < p.bubbleLife);
}
export function bubbleOpacity(age: number): number { return Math.max(0, 1 - age / p.bubbleLife); }


/** Display-only rigid rotation: preserve the exact pinch midpoint and all lengths. */
export function tiltHandJoints(joints: readonly Vector3[]): Vector3[] {
  if(joints.length!==21) return [];
  const pivot=joints[4].clone().add(joints[8]).multiplyScalar(.5);
  const {across,up}=handFrame(joints);
  const tiltedUp=up.clone().applyAxisAngle(across,p.displayTiltAcross);
  return joints.map(v=>v.clone().sub(pivot).applyAxisAngle(across,p.displayTiltAcross)
    .applyAxisAngle(tiltedUp,p.displayTiltUp).add(pivot));
}
