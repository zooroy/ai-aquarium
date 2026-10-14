import { Matrix4, Quaternion, Vector3 } from 'three';
import { HAND_PARAMS, HAND_RENDER_PARAMS as p } from '../../config/params';
import type { HandPose } from '../../input/hand/types';

/** joints 已由 provider 鏡像並翻轉 y，此處不可再翻一次。 */
export function transformHandJoints(pose: HandPose, target: Vector3): Vector3[] {
  const joints = pose.joints.map((joint) => new Vector3(joint.x, joint.y, joint.z).multiplyScalar(HAND_PARAMS.worldScale));
  if (joints.length !== 21) return [];
  const offset = target.clone().sub(joints[4].clone().add(joints[8]).multiplyScalar(0.5));
  return joints.map((joint) => joint.add(offset));
}
export function boneTransform(start: Vector3, end: Vector3, radius = 1, extension = 0): Matrix4 {
  const delta = end.clone().sub(start), length = delta.length();
  const rotation = length > 0 ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.divideScalar(length)) : new Quaternion();
  return new Matrix4().compose(start.clone().add(end).multiplyScalar(0.5), rotation, new Vector3(radius, length + extension * 2, radius));
}
export interface HandBubble { position: Vector3; velocity: Vector3; age: number; }
export function advanceHandBubbles(bubbles: readonly HandBubble[], dt: number): HandBubble[] {
  return bubbles.map((bubble) => ({ position: bubble.position.clone().addScaledVector(bubble.velocity, Math.max(0, dt)), velocity: bubble.velocity.clone(), age: bubble.age + Math.max(0, dt) })).filter((bubble) => bubble.age < p.bubbleLife);
}
export function bubbleOpacity(age: number): number { return Math.max(0, 1 - age / p.bubbleLife); }

/** 骨頭使用單位半徑網格，同指三段共用最靠近手掌一段的半徑。 */
export function handRadii(joints: readonly Vector3[], edges: readonly number[][]): number[] {
  return edges.map(([a]) => {
    const base = 1 + Math.floor((a - 1) / 4) * 4;
    return joints[base].distanceTo(joints[base + 1]) * (base === 1 ? p.thumbRadiusRatio : p.boneRadiusRatio);
  });
}
