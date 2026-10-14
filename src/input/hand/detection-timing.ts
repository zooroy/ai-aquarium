import { HAND_TRACKER_PARAMS as p } from '../../config/params';

/** 共用於暫時與正式偵測迴圈；last 為上次接受影格的時間（ms）。 */
export function shouldDetectFrame(now: number, last: number, maxHz: number = p.maxHz): boolean {
  return now - last >= (1000 / maxHz) * p.intervalTolerance;
}

export interface DetectionSample { timestamp: number; durationMs: number; }

/** 純函式，視窗為 (now - windowMs, now]；Hz 是此視窗內的完成次數／秒。 */
export function updateDetectionWindow(
  previous: readonly DetectionSample[], now: number, sample?: DetectionSample,
): { samples: DetectionSample[]; hz: number; averageMs: number } {
  const samples = (sample ? [...previous, sample] : [...previous])
    .filter((entry) => entry.timestamp > now - p.statsWindowMs && entry.timestamp <= now);
  return {
    samples,
    hz: samples.length * 1000 / p.statsWindowMs,
    averageMs: samples.length ? samples.reduce((sum, entry) => sum + entry.durationMs, 0) / samples.length : 0,
  };
}
