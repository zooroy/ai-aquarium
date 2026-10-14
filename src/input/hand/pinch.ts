import { HAND_PARAMS as p } from '../../config/params';
import type { Landmark } from './types';
export function pinchRatio(landmarks: readonly Landmark[]): number {
  const [wrist, thumb, index, middle] = [landmarks[0], landmarks[4], landmarks[8], landmarks[9]];
  if (!wrist || !thumb || !index || !middle) return Infinity;
  const palm = Math.hypot(wrist.x - middle.x, wrist.y - middle.y);
  return palm > 0 ? Math.hypot(thumb.x - index.x, thumb.y - index.y) / palm : Infinity;
}
export class PinchDetector {
  private pressed = false;
  update(ratio: number): boolean {
    if (ratio < p.pinchEnter) this.pressed = true;
    else if (ratio > p.pinchExit) this.pressed = false;
    return this.pressed;
  }
  reset(): void { this.pressed = false; }
}
