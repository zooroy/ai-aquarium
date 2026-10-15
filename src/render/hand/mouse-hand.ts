import { CURSOR_PARAMS, HAND_PARAMS } from '../../config/params';
import { blendPose } from '../../input/hand/hand-poses';
import type { HandPose } from '../../input/hand/types';
import type { Pointer } from '../../input/types';

/** 由滑鼠游標合成右手 HandPose：左鍵捏合、右鍵握拳，姿勢與透明度隨時間平順變化。 */
export class MouseHandPose {
  private pinch = 0;
  private fist = 0;
  private opacity = 0;
  private position = { x: 0.5, y: 0.5 };

  update(pointer: Pointer | undefined, dt: number): HandPose {
    const step = Math.max(0, dt);
    const toward = (value: number, target: number, rate: number) =>
      value < target ? Math.min(target, value + step * rate) : Math.max(target, value - step * rate);
    const poseRate = 1 / CURSOR_PARAMS.transitionDuration, fadeRate = 1 / HAND_PARAMS.fadeSeconds;
    if (pointer) this.position = { x: pointer.x, y: pointer.y };
    this.pinch = toward(this.pinch, pointer?.pressed ? 1 : 0, poseRate);
    this.fist = toward(this.fist, pointer?.fist ? 1 : 0, poseRate);
    this.opacity = toward(this.opacity, pointer ? 1 : 0, fadeRate);
    // 和 HandProvider 對 worldLandmarks 的轉換相同：x、y 取負，z 不變。
    const joints = blendPose(this.pinch, this.fist).map((joint) => ({ x: -joint.x, y: -joint.y, z: joint.z }));
    return {
      visible: !!pointer, opacity: this.opacity, joints, pointer: { ...this.position },
      pressed: pointer?.pressed ?? false, fist: pointer?.fist ?? false, fistRatio: Infinity, handedness: 'right',
    };
  }

  reset(): void {
    this.pinch = 0; this.fist = 0; this.opacity = 0; this.position = { x: 0.5, y: 0.5 };
  }
}
