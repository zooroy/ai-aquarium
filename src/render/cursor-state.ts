import { CURSOR_PARAMS } from '../config/params';
import type { InputState } from '../input/types';

export interface CursorVisualState { id: string; x: number; y: number; activation: number; fistActivation: number; }

/** 純函式：依 id 增刪，按下程度在 100ms 內線性抵達目標；不修改舊快照。 */
export function updateCursorStates(previous: readonly CursorVisualState[], state: InputState, dt: number): CursorVisualState[] {
  const old = new Map(previous.map((item) => [item.id, item]));
  const step = Math.max(0, dt) / CURSOR_PARAMS.transitionDuration;
  return state.pointers.map((pointer) => {
    const activation = old.get(pointer.id)?.activation ?? 0;
    const fistActivation = old.get(pointer.id)?.fistActivation ?? 0;
    return {
      id: pointer.id, x: pointer.x, y: pointer.y,
      activation: pointer.pressed ? Math.min(1, activation + step) : Math.max(0, activation - step),
      fistActivation: pointer.fist ? Math.min(1, fistActivation + step) : Math.max(0, fistActivation - step),
    };
  });
}
