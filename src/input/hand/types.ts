export type HandSide = 'left' | 'right';
export interface HandClassification { categoryName: string; score: number; }
export interface Landmark { x: number; y: number; z: number; }

export interface HandFrame {
  landmarks: Landmark[];       // 21 個，影像正規化座標（0..1，未鏡像）
  worldLandmarks: Landmark[];  // 21 個，公尺，以手的中心為原點
  handedness?: HandClassification; // MediaPipe 原始標籤；缺少時保留既有判斷。
  timestamp: number;           // ms
}

export interface HandPose {
  visible: boolean;            // 目前偵測到手，或還在寬限時間內
  opacity: number;             // 0..1，用於淡入淡出（hand-avatar spec）
  joints: Landmark[];          // 21 個，已平滑、已鏡像、y 向上，單位公尺
  pointer: { x: number; y: number };  // 和 hand-0 游標相同
  pressed: boolean;
  handedness: HandSide | null; // 經標籤反轉與遲滯後的使用者左右手。
}
