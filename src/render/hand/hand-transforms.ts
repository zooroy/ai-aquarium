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
export function boneTransform(start: Vector3, end: Vector3, radius = 1): Matrix4 {
  const delta = end.clone().sub(start), length = delta.length();
  const rotation = length > 0 ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.divideScalar(length)) : new Quaternion();
  return new Matrix4().compose(start.clone().add(end).multiplyScalar(0.5), rotation, new Vector3(radius, length, radius));
}
export interface HandBubble { position: Vector3; velocity: Vector3; age: number; }
export function advanceHandBubbles(bubbles: readonly HandBubble[], dt: number): HandBubble[] {
  return bubbles.map((bubble) => ({ position: bubble.position.clone().addScaledVector(bubble.velocity, Math.max(0, dt)), velocity: bubble.velocity.clone(), age: bubble.age + Math.max(0, dt) })).filter((bubble) => bubble.age < p.bubbleLife);
}
export function bubbleOpacity(age: number): number { return Math.max(0, 1 - age / p.bubbleLife); }

/** 骨頭使用單位半徑網格，半徑隨相鄰關節距離變化。 */
export function handRadii(joints: readonly Vector3[], edges: readonly number[][]): { bones: number[]; joints: number[] } {
  const bones = edges.map(([a, b]) => joints[a].distanceTo(joints[b]) * (b <= 4 || a === 0 ? p.thumbRadiusRatio : p.boneRadiusRatio));
  const radii = joints.map(() => 0);
  edges.forEach(([a,b], i) => { radii[a] = Math.max(radii[a], bones[i]); radii[b] = Math.max(radii[b], bones[i]); });
  return { bones, joints: radii.map((radius, i) => radius * (i === 0 ? p.wristScale : [4,8,12,16,20].includes(i) ? p.tipScale : p.jointScale)) };
}
