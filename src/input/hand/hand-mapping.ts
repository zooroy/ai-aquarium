import { HAND_PARAMS } from '../../config/params';
export function mapToScreen({ x, y }: { x: number; y: number }): { x: number; y: number } {
  const area = HAND_PARAMS.activeArea;
  const map = (value: number) => Math.max(0, Math.min(1, (value - (1 - area) / 2) / area));
  return { x: map(1 - x), y: map(y) };
}
