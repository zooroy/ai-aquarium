import { expect,it } from 'vitest';
import { blendPose,OPEN_POSE,FIST_POSE } from '../../../src/input/hand/hand-poses';
import { fistRatio,FistDetector } from '../../../src/input/hand/fist';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource,getReplayScript } from '../../../src/input/hand/replay-source';
import { createReplaySource as oldSource,getReplayScript as oldScript } from './fixtures/replay-before-fist';
it('measures scale-invariant 3D fist ratios and rejects invalid data',()=>{
  expect(fistRatio(blendPose(0,0))).toBeGreaterThan(1.9);
  expect(fistRatio(blendPose(1,0))).toBeGreaterThan(1.5);
  const fist=blendPose(0,1),ratio=fistRatio(fist);
  expect(ratio).toBeGreaterThanOrEqual(.9);expect(ratio).toBeLessThanOrEqual(1.1);
  for(const scale of [.5,2]) expect(fistRatio(fist.map(p=>({x:p.x*scale,y:p.y*scale,z:p.z*scale})))).toBeCloseTo(ratio,12);
  expect(fistRatio([])).toBe(Infinity);
  expect(fistRatio(Array.from({length:21},()=>({x:0,y:0,z:0})))).toBe(Infinity);
  expect(fistRatio(fist.map(p=>({...p,z:NaN})))).toBe(Infinity);
});
it('preserves each fist segment length and clamps blending weights',()=>{
  const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const base of [1,5,9,13,17]) for(let k=0;k<4;k++) {
    const previous=k===0?0:base+k-1,index=base+k;
    const ratio=distance(FIST_POSE[index],FIST_POSE[previous])/distance(OPEN_POSE[index],OPEN_POSE[previous]);
    expect(ratio).toBeGreaterThanOrEqual(.8);expect(ratio).toBeLessThanOrEqual(1.2);
  }
  expect(blendPose(2,2)).toEqual(blendPose(0,1));expect(blendPose(-1,-1)).toEqual(blendPose(0,0));
  const f=blendPose(0,1);
  expect(Math.hypot((f[4].x+f[8].x)/2-f[0].x,(f[4].y+f[8].y)/2-f[0].y,(f[4].z+f[8].z)/2-f[0].z)).toBeGreaterThan(.01);
});
it('holds hysteresis in both directions and resets',()=>{
  const detector=new FistDetector();
  for(const ratio of [1.3,1.45,1.3]) expect(detector.update(ratio)).toBe(false);
  expect(detector.update(1.1)).toBe(true);
  for(const ratio of [1.3,1.45,1.3]) expect(detector.update(ratio)).toBe(true);
  expect(detector.update(1.6)).toBe(false);detector.update(1);detector.reset();expect(detector.update(1.4)).toBe(false);
});
it('keeps demo, jitter and dropout output identical to the previous replay',()=>{
  for(const name of ['demo','jitter','dropout']) {
    const old=oldSource(oldScript(name)),current=createReplaySource(getReplayScript(name));
    for(const time of [0,123,1000,1100,2100,2500,3000,3500,5000,6500,7000,8000,10000]) expect(current.frameAt(time)).toEqual(old.frameAt(time));
  }
});
it('detects replay fist, retains grace state, releases after open, and resets',()=>{
  const replay=createReplaySource(getReplayScript('fist')),provider=new HandProvider();
  for(let t=0;t<=3000;t+=1000/30) provider.ingest(replay.frameAt(t),t);
  provider.ingest(replay.frameAt(3000),3000);
  expect(provider.getPointers()[0]).toMatchObject({fist:true,pressed:false});
  provider.ingest(null,3200);expect(provider.getPointers()[0].fist).toBe(true);
  provider.update(3301);expect(provider.getPointers()).toEqual([]);
  for(let t=3400;t<=8000;t+=1000/30) provider.ingest(replay.frameAt(t),t);
  expect(provider.getPointers()[0]).toMatchObject({fist:false,pressed:false});
  provider.stop();expect(provider.getHandPose()).toMatchObject({fist:false,fistRatio:Infinity});
});
it('gives fist priority even when image landmarks report a pinch',()=>{
  const frame=createReplaySource(getReplayScript('dropout')).frameAt(0)!;
  frame.worldLandmarks=blendPose(0,1);
  const provider=new HandProvider();provider.ingest(frame,0);
  expect(provider.getPointers()[0]).toMatchObject({fist:true,pressed:false});
  const pinched=new HandProvider();pinched.ingest(createReplaySource(getReplayScript('dropout')).frameAt(0),0);
  expect(pinched.getPointers()[0]).toMatchObject({fist:false,pressed:true});
});
