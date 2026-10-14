import type { HandFrame } from '../input/hand/types';
import { shouldDetectFrame, updateDetectionWindow } from '../input/hand/detection-timing';
import type { DetectionSample } from '../input/hand/detection-timing';
import { HAND_TRACKER_PARAMS as p } from '../config/params';
import { HandTracker } from '../input/hand/hand-tracker';

export interface DetectionStats { hz: number; averageMs: number; delegate: string; detected: boolean; }

/** 暫時入口；同步回傳 disposer，非同步初始化途中也能取消並釋放資源。 */
export function startCameraDebug(report: (stats: DetectionStats) => void, ingest?: (frame: HandFrame | null, nowMs: number) => void): () => void {
  let stopped = false, stream: MediaStream | undefined, tracker: HandTracker | undefined;
  let video: HTMLVideoElement | undefined, callback: number | undefined;
  let videoCallbacks = false;
  const dispose = () => {
    stopped = true;
    if (callback !== undefined) {
      if (videoCallbacks) video?.cancelVideoFrameCallback(callback);
      else cancelAnimationFrame(callback);
    }
    stream?.getTracks().forEach((track) => track.stop());
    tracker?.dispose();
    if (video) { video.pause(); video.srcObject = null; video.remove(); }
  };
  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: p.width, height: p.height, facingMode: 'user' } });
      if (stopped) { dispose(); return; }
      video = document.createElement('video'); video.style.display = 'none';
      video.muted = true; video.playsInline = true; video.srcObject = stream; document.body.append(video);
      await video.play();
      if (stopped) { dispose(); return; }
      tracker = await HandTracker.create();
      if (stopped) { dispose(); return; }
      videoCallbacks = typeof video.requestVideoFrameCallback === 'function';
      let last = -Infinity, lastVideoTime = -1;
      let samples: DetectionSample[] = [];
      let detected = false;
      report({ hz: 0, averageMs: 0, delegate: tracker.delegate, detected: false });
      const schedule = () => {
        if (stopped || !video) return;
        callback = videoCallbacks ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
      };
      const tick = (now: number) => {
        if (stopped || !video || !tracker) return;
        try {
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime && shouldDetectFrame(now, last)) {
            last = now; lastVideoTime = video.currentTime;
            const before = performance.now();
            const frame = tracker.detect(video, now);
            ingest?.(frame, now);
            const finished = performance.now();
            samples = updateDetectionWindow(samples, finished, { timestamp: finished, durationMs: finished - before }).samples;
            detected = frame !== null;
          }
          const stats = updateDetectionWindow(samples, performance.now());
          samples = stats.samples;
          report({ hz: stats.hz, averageMs: stats.averageMs, delegate: tracker.delegate, detected });
          schedule();
        } catch (error) { console.warn('鏡頭偵測失敗', error); dispose(); }
      };
      schedule();
    } catch (error) { if (!stopped) console.warn('鏡頭除錯啟動失敗', error); dispose(); }
  })();
  return dispose;
}
