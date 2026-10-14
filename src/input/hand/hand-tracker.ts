import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { HAND_TRACKER_PARAMS as p } from '../../config/params';
import type { HandFrame, Landmark, HandClassification } from './types';

export function toHandFrame(result: { landmarks: readonly (readonly Landmark[])[]; worldLandmarks: readonly (readonly Landmark[])[]; handedness?: readonly (readonly HandClassification[])[] }, timestamp: number): HandFrame | null {
  const landmarks = result.landmarks[0], worldLandmarks = result.worldLandmarks[0];
  if (!landmarks?.length || !worldLandmarks?.length) return null;
  const label=result.handedness?.[0]?.[0];
  return {
    handedness: label ? {categoryName:label.categoryName,score:label.score} : undefined,
    landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
    worldLandmarks: worldLandmarks.map(({ x, y, z }) => ({ x, y, z })), timestamp,
  };
}

export class HandTracker {
  private closed = false;
  private constructor(private readonly landmarker: HandLandmarker, readonly delegate: 'GPU' | 'CPU') {}

  static async create(): Promise<HandTracker> {
    // 延遲載入；一般滑鼠模式與純資料轉換測試不載入 MediaPipe runtime。
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(p.wasmPath);
    const create = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: p.modelPath, delegate }, runningMode: 'VIDEO', numHands: p.numHands,
    });
    try { return new HandTracker(await create('GPU'), 'GPU'); }
    catch { return new HandTracker(await create('CPU'), 'CPU'); }
  }
  detect(video: HTMLVideoElement, timestampMs: number): HandFrame | null {
    if (this.closed) return null;
    return toHandFrame(this.landmarker.detectForVideo(video, timestampMs), timestampMs);
  }
  dispose(): void {
    if (!this.closed) { this.closed = true; this.landmarker.close(); }
  }
}
