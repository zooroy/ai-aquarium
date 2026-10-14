import { HandTracker } from '../input/hand/hand-tracker';
import type { HandFrame } from '../input/hand/types';
import { shouldDetectFrame, updateDetectionWindow } from '../input/hand/detection-timing';
import type { DetectionSample } from '../input/hand/detection-timing';
import { HAND_TRACKER_PARAMS as p } from '../config/params';
export interface DetectionStats { hz: number; averageMs: number; delegate: string; detected: boolean; }
export type CameraFailure = 'permission' | 'missing' | 'insecure' | 'model' | 'unknown';
export interface CameraDependencies {
  secure: boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createTracker: () => Promise<Pick<HandTracker, 'detect' | 'dispose' | 'delegate'>>;
  createVideo: () => HTMLVideoElement;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
}
export function browserCameraDependencies(): CameraDependencies {
  return {
    secure: globalThis.isSecureContext,
    getUserMedia: navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices),
    createTracker: () => HandTracker.create(),
    createVideo: () => { const video = document.createElement('video'); video.style.display = 'none'; document.body.append(video); return video; },
    now: () => performance.now(), requestFrame: (callback) => requestAnimationFrame(callback), cancelFrame: (id) => cancelAnimationFrame(id),
  };
}
export function classifyCameraError(error: unknown, model = false): CameraFailure {
  if (model) return 'model';
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  return name === 'NotAllowedError' ? 'permission' : name === 'NotFoundError' ? 'missing' : 'unknown';
}
export function startCameraSession(callbacks: {
  ready(): void; failed(reason: CameraFailure): void;
  ingest(frame: HandFrame | null, now: number): void; report(stats: DetectionStats): void;
}, deps: CameraDependencies = browserCameraDependencies()): { dispose(): void } {
  let stopped = false, stream: MediaStream | undefined, video: HTMLVideoElement | undefined;
  let tracker: Awaited<ReturnType<CameraDependencies['createTracker']>> | undefined;
  let callback: number | undefined, videoCallbacks = false;
  const dispose = () => {
    stopped = true;
    if (callback !== undefined) { if (videoCallbacks) video?.cancelVideoFrameCallback(callback); else deps.cancelFrame(callback); callback = undefined; }
    const oldStream = stream; stream = undefined; oldStream?.getTracks().forEach((track) => track.stop());
    const oldTracker = tracker; tracker = undefined; oldTracker?.dispose();
    const oldVideo = video; video = undefined;
    if (oldVideo) { oldVideo.pause(); oldVideo.srcObject = null; oldVideo.remove(); }
  };
  const fail = (reason: CameraFailure, error: unknown) => {
    if (stopped) return;
    console.warn('鏡頭模式停止', error); dispose(); callbacks.failed(reason);
  };
  // 延後到 microtask，確保呼叫者先取得同步 disposer。
  void Promise.resolve().then(async () => {
    if (stopped) return;
    if (!deps.secure || !deps.getUserMedia) { fail('insecure', 'Camera requires a secure context and mediaDevices'); return; }
    let model = false;
    try {
      stream = await deps.getUserMedia({ audio: false, video: { width: p.width, height: p.height, facingMode: 'user' } });
      if (stopped) { dispose(); return; }
      video = deps.createVideo(); video.style.display = 'none'; video.muted = true; video.playsInline = true; video.srcObject = stream;
      await video.play(); if (stopped) { dispose(); return; }
      model = true; tracker = await deps.createTracker(); model = false;
      if (stopped) { dispose(); return; }
      videoCallbacks = typeof video.requestVideoFrameCallback === 'function';
      let last = -Infinity, lastVideoTime = -1; let samples: DetectionSample[] = []; let detected = false;
      const schedule = () => { if (!stopped && video) callback = videoCallbacks ? video.requestVideoFrameCallback(tick) : deps.requestFrame(tick); };
      const tick = (now: number) => {
        if (stopped || !video || !tracker) return;
        try {
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime && shouldDetectFrame(now, last)) {
            last = now; lastVideoTime = video.currentTime;
            const before = deps.now(), frame = tracker.detect(video, now), finished = deps.now();
            callbacks.ingest(frame, now); detected = frame !== null;
            samples = updateDetectionWindow(samples, finished, { timestamp: finished, durationMs: finished - before }).samples;
          }
          const stats = updateDetectionWindow(samples, deps.now()); samples = stats.samples;
          callbacks.report({ hz: stats.hz, averageMs: stats.averageMs, delegate: tracker.delegate, detected }); schedule();
        } catch (error) { fail('unknown', error); }
      };
      callbacks.ready(); callbacks.report({ hz: 0, averageMs: 0, delegate: tracker.delegate, detected: false }); schedule();
    } catch (error) { if (stopped) dispose(); else fail(classifyCameraError(error, model), error); }
  });
  return { dispose };
}
