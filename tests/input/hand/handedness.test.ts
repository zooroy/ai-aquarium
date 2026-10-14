import { expect,it } from 'vitest';
import { HandednessFilter,labelToHand } from '../../../src/input/hand/handedness';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource,getReplayScript } from '../../../src/input/hand/replay-source';
import { HAND_PARAMS } from '../../../src/config/params';

it('inverts unmirrored camera labels and can disable inversion',()=>{
  expect(labelToHand('Left')).toBe('right');
  expect(labelToHand('Right')).toBe('left');
  expect(labelToHand('Left',false)).toBe('left');
  expect(labelToHand('Right',false)).toBe('right');
  expect(labelToHand('Unknown')).toBeNull();
});
it('requires consecutive confident classifications to switch and ignores missing/weak labels',()=>{
  const filter=new HandednessFilter(),right={categoryName:'Left',score:.99},left={categoryName:'Right',score:.99};
  expect(filter.update(undefined)).toBeNull();
  expect(filter.update(right)).toBe('right');
  for(let i=0;i<8;i++) {expect(filter.update(left)).toBe('right');expect(filter.update(right)).toBe('right');}
  filter.update(left);filter.update({ ...left,score:.1 });
  for(let i=1;i<HAND_PARAMS.handednessSwitchFrames;i++) expect(filter.update(left)).toBe('right');
  expect(filter.update(left)).toBe('left');
  expect(filter.update(undefined)).toBe('left');
  filter.reset();expect(filter.update(undefined)).toBeNull();
});
it('replays real-camera right hands and preserves fixed first-person coordinates for either palm orientation',()=>{
  const replay=createReplaySource(getReplayScript('demo'));
  const open=replay.frameAt(1000)!,pinch=replay.frameAt(5000)!;
  expect(open.handedness).toEqual({categoryName:'Left',score:.99});
  expect(open.worldLandmarks[4].x).toBeGreaterThan(open.worldLandmarks[9].x);
  for(const i of [4,8]) expect(pinch.worldLandmarks[i].z).toBeLessThan(open.worldLandmarks[i].z);
  for(const left of [false,true]) for(const back of [false,true]) {
    const frame={...open,handedness:{categoryName:left?'Right':'Left',score:.99},
      worldLandmarks:open.worldLandmarks.map(p=>({...p,x:p.x*(left?-1:1)*(back?-1:1),z:p.z*(back?-1:1)}))};
    const provider=new HandProvider();provider.ingest(frame,1000);
    const pose=provider.getHandPose(1000);
    expect(pose.handedness).toBe(left?'left':'right');
    pose.joints.forEach((p,i)=>{
      expect(p.x).toBe(-frame.worldLandmarks[i].x);
      expect(p.y).toBe(-frame.worldLandmarks[i].y);
      expect(p.z).toBe(frame.worldLandmarks[i].z);
    });
  }
});
