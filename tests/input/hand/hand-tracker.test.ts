import { beforeEach, expect, it, vi } from 'vitest';
import { HandTracker, toHandFrame } from '../../../src/input/hand/hand-tracker';
const mocks = vi.hoisted(() => ({ files: vi.fn(), create: vi.fn(), detect: vi.fn(), close: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({ FilesetResolver: { forVisionTasks: mocks.files }, HandLandmarker: { createFromOptions: mocks.create } }));
const landmarks = Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.2, z: -0.1 }));
const result = { landmarks: [landmarks], worldLandmarks: [landmarks.map((p) => ({ ...p, x: p.x / 10 }))] };
beforeEach(() => { vi.resetAllMocks(); mocks.files.mockResolvedValue({}); mocks.create.mockResolvedValue({ detectForVideo: mocks.detect, close: mocks.close }); });
it('returns null without a hand and copies the first unmirrored hand with timestamp', () => {
  expect(toHandFrame({ landmarks: [], worldLandmarks: [] }, 1)).toBeNull();
  expect(toHandFrame({ landmarks: [landmarks], worldLandmarks: [] }, 1)).toBeNull();
  const frame = toHandFrame({ landmarks: [landmarks, landmarks], worldLandmarks: result.worldLandmarks }, 123)!;
  expect(frame.timestamp).toBe(123); expect(frame.landmarks).toHaveLength(21);
  expect(frame.landmarks).toEqual(landmarks);
  expect(frame.worldLandmarks).toEqual(result.worldLandmarks[0]);
  frame.landmarks[0].x = 99; expect(landmarks[0].x).toBe(0);
});
it('loads local assets with VIDEO/GPU and closes once', async () => {
  const tracker = await HandTracker.create();
  expect(tracker.delegate).toBe('GPU');
  expect(mocks.files).toHaveBeenCalledWith('/mediapipe/wasm');
  expect(mocks.create).toHaveBeenCalledWith({}, { baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1 });
  mocks.detect.mockReturnValue(result);
  const video = {} as HTMLVideoElement;
  expect(tracker.detect(video, 200)?.timestamp).toBe(200);
  expect(mocks.detect).toHaveBeenCalledWith(video, 200);
  tracker.dispose(); tracker.dispose(); expect(mocks.close).toHaveBeenCalledOnce();
  expect(tracker.detect(video, 300)).toBeNull();
});
it('falls back to CPU and propagates failure if both delegates fail', async () => {
  mocks.create.mockRejectedValueOnce(new Error('GPU unavailable'));
  const tracker = await HandTracker.create(); expect(tracker.delegate).toBe('CPU');
  expect(mocks.create.mock.calls[1][1].baseOptions.delegate).toBe('CPU'); tracker.dispose();
  mocks.create.mockRejectedValue(new Error('model failure'));
  await expect(HandTracker.create()).rejects.toThrow('model failure');
});
it('copies the first MediaPipe handedness category and score without using deprecated labels',()=>{
  const handedness=[[{categoryName:'Left',score:.98}],[{categoryName:'Right',score:.8}]];
  const frame=toHandFrame({...result,handedness},42)!;
  expect(frame.handedness).toEqual({categoryName:'Left',score:.98});
  handedness[0][0].score=0;
  expect(frame.handedness?.score).toBe(.98);
  expect(toHandFrame(result,42)?.handedness).toBeUndefined();
});
