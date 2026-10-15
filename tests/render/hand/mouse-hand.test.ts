import { expect, it } from 'vitest';
import { MouseHandPose } from '../../../src/render/hand/mouse-hand';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { fistRatio } from '../../../src/input/hand/fist';
import { CURSOR_PARAMS, HAND_PARAMS } from '../../../src/config/params';
import type { Pointer } from '../../../src/input/types';

const mouse: Pointer = { id: 'mouse', x: .3, y: .6, pressed: false, fist: false, source: 'mouse' };
const tipGap = (joints: readonly { x: number; y: number; z: number }[]) => {
  const palm = Math.hypot(joints[0].x - joints[9].x, joints[0].y - joints[9].y, joints[0].z - joints[9].z);
  return Math.hypot(joints[4].x - joints[8].x, joints[4].y - joints[8].y, joints[4].z - joints[8].z) / palm;
};

it('is an open right hand that follows the mouse and fades in', () => {
  const hand = new MouseHandPose();
  const pose = hand.update(mouse, HAND_PARAMS.fadeSeconds / 2);
  expect(pose.handedness).toBe('right');
  expect(pose.visible).toBe(true);
  expect(pose.pointer).toEqual({ x: .3, y: .6 });
  expect(pose.opacity).toBeCloseTo(.5);
  expect(pose.joints).toHaveLength(21);
  expect(pose.pressed).toBe(false); expect(pose.fist).toBe(false);
  expect(fistRatio(pose.joints)).toBeGreaterThan(HAND_PARAMS.fistExit);
  expect(hand.update(mouse, 1).opacity).toBe(1);
});

it('pinches on the left button and makes a fist on the right button within the transition time', () => {
  const hand = new MouseHandPose();
  hand.update(mouse, 1);
  const half = hand.update({ ...mouse, pressed: true }, CURSOR_PARAMS.transitionDuration / 2);
  const pinched = hand.update({ ...mouse, pressed: true }, CURSOR_PARAMS.transitionDuration / 2);
  expect(tipGap(pinched.joints)).toBeLessThan(tipGap(half.joints));
  expect(tipGap(pinched.joints)).toBeLessThan(HAND_PARAMS.pinchEnter);
  expect(pinched.pressed).toBe(true);
  hand.update(mouse, 1);
  const fist = hand.update({ ...mouse, fist: true }, CURSOR_PARAMS.transitionDuration);
  expect(fist.fist).toBe(true); expect(fist.pressed).toBe(false);
  expect(fistRatio(fist.joints)).toBeLessThan(HAND_PARAMS.fistEnter);
  const open = hand.update(mouse, CURSOR_PARAMS.transitionDuration);
  expect(fistRatio(open.joints)).toBeGreaterThan(HAND_PARAMS.fistExit);
});

it('stays at the last position and fades out when the mouse leaves', () => {
  const hand = new MouseHandPose();
  hand.update(mouse, 1);
  const leaving = hand.update(undefined, HAND_PARAMS.fadeSeconds / 2);
  expect(leaving.visible).toBe(false);
  expect(leaving.pointer).toEqual({ x: .3, y: .6 });
  expect(leaving.opacity).toBeCloseTo(.5);
  expect(hand.update(undefined, 1).opacity).toBe(0);
  hand.reset();
  expect(hand.update(undefined, 0).opacity).toBe(0);
});

it('uses the same first-person joints as HandProvider for the same replay pose', () => {
  for (const [script, time, pointer] of [['fist', 3000, { ...mouse, fist: true }], ['demo', 5000, { ...mouse, pressed: true }], ['demo', 1000, mouse]] as const) {
    const provider = new HandProvider();
    provider.ingest(createReplaySource(getReplayScript(script)).frameAt(time), time);
    const expected = provider.getHandPose(time).joints;
    const hand = new MouseHandPose();
    const joints = hand.update(pointer, 1).joints;
    joints.forEach((joint, i) => {
      expect(joint.x).toBeCloseTo(expected[i].x, 9);
      expect(joint.y).toBeCloseTo(expected[i].y, 9);
      expect(joint.z).toBeCloseTo(expected[i].z, 9);
    });
  }
});
