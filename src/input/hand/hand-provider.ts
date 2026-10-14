import { HAND_PARAMS as p } from '../../config/params';
import type { InputProvider, Pointer } from '../types';
import type { HandFrame, HandPose } from './types';
import { HandednessFilter } from './handedness';
import { OneEuroFilter } from './one-euro';
import { PinchDetector, pinchRatio } from './pinch';
import { mapToScreen } from './hand-mapping';

export class HandProvider implements InputProvider {
  readonly name = 'hand';
  private readonly handedness = new HandednessFilter();
  private readonly x = new OneEuroFilter();
  private readonly y = new OneEuroFilter();
  private readonly ratio = new OneEuroFilter();
  private readonly joints = Array.from({ length: 21 }, () => [new OneEuroFilter(), new OneEuroFilter(), new OneEuroFilter()]);
  private readonly pinch = new PinchDetector();
  private lastSeen = -Infinity;
  private now: number | undefined;
  private pose: HandPose = { visible: false, opacity: 0, joints: [], pointer: { x: 0.5, y: 0.5 }, pressed: false, handedness: null };
  // 使用外部 ingest 注入，不在 provider 內持有 tracker、video 或時鐘。
  start(_target: Parameters<InputProvider['start']>[0]): void {}
  stop(): void {
    this.resetFilters(); this.lastSeen = -Infinity; this.now = undefined;
    this.pose = { visible: false, opacity: 0, joints: [], pointer: { x: 0.5, y: 0.5 }, pressed: false, handedness: null };
  }
  private resetFilters(): void {
    this.handedness.reset();
    this.x.reset(); this.y.reset(); this.ratio.reset(); this.pinch.reset();
    for (const filters of this.joints) for (const filter of filters) filter.reset();
  }
  ingest(frame: HandFrame | null, nowMs: number): void {
    if (this.now !== undefined && nowMs < this.now) return;
    this.update(nowMs);
    if (!frame || frame.landmarks.length !== 21 || frame.worldLandmarks.length !== 21) {this.handedness.update(undefined);return;}
    const ratio = pinchRatio(frame.landmarks);
    if (!Number.isFinite(ratio)) return;
    if (nowMs - this.lastSeen > p.graceMs) this.resetFilters();
    this.pose.handedness=this.handedness.update(frame.handedness);
    const time = nowMs / 1000;
    const thumb = frame.landmarks[4], index = frame.landmarks[8];
    this.pose.pointer = mapToScreen({ x: this.x.filter((thumb.x + index.x) / 2, time), y: this.y.filter((thumb.y + index.y) / 2, time) });
    this.pose.joints = frame.worldLandmarks.map((joint, i) => ({
      x: this.joints[i][0].filter(-joint.x, time), y: this.joints[i][1].filter(-joint.y, time), z: this.joints[i][2].filter(joint.z, time),
    }));
    this.pose.pressed = this.pinch.update(this.ratio.filter(ratio, time));
    this.lastSeen = nowMs; this.pose.visible = true;
  }
  /** 每個渲染幀先 update(nowMs)，再讀 pointers；無新偵測也會過期與淡出。 */
  update(nowMs: number): void {
    const from = this.now ?? nowMs;
    if (nowMs < from) return;
    const expires = this.lastSeen + p.graceMs;
    const fadeInMs = Math.max(0, Math.min(nowMs, expires) - from);
    const fadeOutMs = Math.max(0, nowMs - Math.max(from, expires));
    this.pose.opacity = Math.max(0, Math.min(1, this.pose.opacity + fadeInMs / (p.fadeSeconds * 1000)) - fadeOutMs / (p.fadeSeconds * 1000));
    this.pose.visible = nowMs <= expires;
    this.now = nowMs;
  }
  getPointers(): Pointer[] {
    return this.pose.visible ? [{ id: 'hand-0', source: 'hand', ...this.pose.pointer, pressed: this.pose.pressed }] : [];
  }
  getHandPose(nowMs?: number): HandPose {
    if (nowMs !== undefined) this.update(nowMs);
    return { ...this.pose, pointer: { ...this.pose.pointer }, joints: this.pose.joints.map((joint) => ({ ...joint })) };
  }
}
