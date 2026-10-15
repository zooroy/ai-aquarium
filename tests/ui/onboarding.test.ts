import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createOnboardingController, CAMERA_MESSAGES } from '../../src/ui/onboarding';
import { startCameraSession } from '../../src/ui/camera-session';
import type { CameraDependencies } from '../../src/ui/camera-session';
import { HandProvider } from '../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../src/input/hand/replay-source';
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
function fixture() {
  let tick: FrameRequestCallback | undefined;
  const stop=vi.fn(), close=vi.fn();
  const stream={ getTracks:()=>[{stop}] } as unknown as MediaStream;
  const video={style:{display:''},muted:false,playsInline:false,srcObject:null,readyState:2,currentTime:1,play:vi.fn().mockResolvedValue(undefined),pause:vi.fn(),remove:vi.fn()} as unknown as HTMLVideoElement;
  const frame=createReplaySource(getReplayScript('demo')).frameAt(0);
  const tracker={delegate:'CPU' as const, detect:vi.fn(()=>frame),dispose:close};
  const deps: CameraDependencies={secure:true,getUserMedia:vi.fn().mockResolvedValue(stream),createTracker:vi.fn().mockResolvedValue(tracker),createVideo:vi.fn(()=>video),now:()=>100,requestFrame:vi.fn((cb)=>{tick=cb;return 1;}),cancelFrame:vi.fn()};
  const provider=new HandProvider();
  const callbacks={changed:vi.fn(),report:vi.fn(),clearHand:vi.fn(()=>provider.stop()),ingest:vi.fn((value: typeof frame,now:number)=>provider.ingest(value,now))};
  return {deps,callbacks,provider,stream,video,tracker,stop,close,tick:(now=100)=>tick?.(now)};
}
beforeEach(()=>vi.spyOn(console,'warn').mockImplementation(()=>{}));
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('mouse selection never requests permission or initializes tracking', async()=>{
 const f=fixture(), c=createOnboardingController(f.callbacks,f.deps); c.mouse(); c.mouse(); await flush();
 expect(f.deps.getUserMedia).not.toHaveBeenCalled(); expect(f.deps.createTracker).not.toHaveBeenCalled();
 expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',''); expect(c.state).toBe('mouse'); c.dispose();
});
it('switches from mouse to camera after the opening choice',async()=>{
 const f=fixture(), c=createOnboardingController(f.callbacks,f.deps); c.mouse(); c.camera();
 expect(c.state).toBe('loading'); c.mouse(); c.camera(); expect(c.state).toBe('loading'); // 載入中忽略切換
 await flush(); expect(c.state).toBe('camera'); expect(f.deps.getUserMedia).toHaveBeenCalledOnce();
 f.tick(); expect(f.provider.getPointers()).toHaveLength(1); c.dispose();
});
it('switches from camera back to mouse and releases the camera',async()=>{
 const f=fixture(), c=createOnboardingController(f.callbacks,f.deps); c.camera(); await flush(); f.tick();
 expect(f.provider.getPointers()).toHaveLength(1);
 c.mouse();
 expect(c.state).toBe('mouse'); expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse','');
 expect(f.stop).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce();
 expect(f.callbacks.clearHand).toHaveBeenCalled(); expect(f.callbacks.report).toHaveBeenLastCalledWith(undefined);
 expect(f.provider.getPointers()).toHaveLength(0);
 c.camera(); await flush(); expect(c.state).toBe('camera'); expect(f.deps.getUserMedia).toHaveBeenCalledTimes(2);
 c.dispose(); expect(f.stop).toHaveBeenCalledTimes(2);
});
it('stays in mouse mode with a notice when switching to the camera fails, and can retry',async()=>{
 vi.useFakeTimers(); const f=fixture(), c=createOnboardingController(f.callbacks,f.deps); c.mouse();
 vi.mocked(f.deps.getUserMedia!).mockRejectedValueOnce({name:'NotAllowedError'});
 c.camera(); await flush();
 expect(c.state).toBe('mouse'); expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',CAMERA_MESSAGES.permission);
 c.camera(); await flush(); expect(c.state).toBe('camera');
 vi.advanceTimersByTime(10000); expect(c.state).toBe('camera'); // 舊的提示計時器不會把狀態改回滑鼠
 c.dispose();
});
it('loads once, hides video, detects and ingests while camera is running', async()=>{
 const f=fixture(), c=createOnboardingController(f.callbacks,f.deps); c.camera(); c.camera(); c.mouse();
 expect(f.callbacks.changed).toHaveBeenLastCalledWith('loading',''); await flush();
 expect(f.callbacks.changed).toHaveBeenLastCalledWith('camera',''); expect(f.deps.getUserMedia).toHaveBeenCalledOnce();
 expect(f.video.style.display).toBe('none'); f.tick(); expect(f.provider.getPointers()).toHaveLength(1);
 c.dispose(); c.dispose(); expect(f.stop).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();expect(f.video.remove).toHaveBeenCalledOnce();
});
it.each(['permission','missing','insecure','model','unknown'] as const)('falls back for %s and expires the notice',async(reason)=>{
 vi.useFakeTimers(); const f=fixture();
 if(reason==='insecure') f.deps.secure=false;
 else if(reason==='model') vi.mocked(f.deps.createTracker).mockRejectedValue(new Error('wasm'));
 else vi.mocked(f.deps.getUserMedia!).mockRejectedValue({name:reason==='permission'?'NotAllowedError':reason==='missing'?'NotFoundError':'Other'});
 const c=createOnboardingController(f.callbacks,f.deps);c.camera();await flush();
 expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',CAMERA_MESSAGES[reason]);
 if(reason==='insecure') expect(f.deps.getUserMedia).not.toHaveBeenCalled();
 vi.advanceTimersByTime(4999);expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',CAMERA_MESSAGES[reason]);
 vi.advanceTimersByTime(1);expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',''); c.dispose();
});
it('rejects absent mediaDevices before requesting permission',async()=>{
 const f=fixture(); f.deps.getUserMedia=undefined;
 const c=createOnboardingController(f.callbacks,f.deps);c.camera();await flush();
 expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',CAMERA_MESSAGES.insecure);expect(f.deps.createVideo).not.toHaveBeenCalled();c.dispose();
});
it('stops and falls back after a detect exception',async()=>{
 const f=fixture(),c=createOnboardingController(f.callbacks,f.deps);c.camera();await flush();
 f.tracker.detect.mockImplementation(()=>{throw new Error('lost context');});f.tick();
 expect(f.callbacks.changed).toHaveBeenLastCalledWith('mouse',CAMERA_MESSAGES.unknown);
 expect(f.stop).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();expect(f.callbacks.report).toHaveBeenLastCalledWith(undefined);c.dispose();
});
it('releases a stream resolving after cancellation',async()=>{
 const f=fixture();let resolve!: (value:MediaStream)=>void;
 vi.mocked(f.deps.getUserMedia!).mockReturnValue(new Promise(r=>{resolve=r;}));
 const c=createOnboardingController(f.callbacks,f.deps);c.camera();await flush();c.dispose();resolve(f.stream);await flush();
 expect(f.stop).toHaveBeenCalledOnce();expect(f.deps.createTracker).not.toHaveBeenCalled();expect(f.callbacks.changed).not.toHaveBeenCalledWith('camera','');
});
it('releases tracker resolving after cancellation during model loading',async()=>{
 const f=fixture();let resolve!: (value:typeof f.tracker)=>void;
 vi.mocked(f.deps.createTracker).mockReturnValue(new Promise(r=>{resolve=r;}));
 const c=createOnboardingController(f.callbacks,f.deps);c.camera();await flush();c.dispose();resolve(f.tracker);await flush();
 expect(f.stop).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();expect(f.callbacks.changed).not.toHaveBeenCalledWith('camera','');
});
it('uses video frame callbacks where available and cancels them',async()=>{
 const f=fixture();f.video.requestVideoFrameCallback=vi.fn(()=>5);f.video.cancelVideoFrameCallback=vi.fn();
 const session=startCameraSession({ready:vi.fn(),failed:vi.fn(),ingest:f.callbacks.ingest,report:f.callbacks.report},f.deps);await flush();
 expect(f.video.requestVideoFrameCallback).toHaveBeenCalledOnce();expect(f.deps.requestFrame).not.toHaveBeenCalled();session.dispose();expect(f.video.cancelVideoFrameCallback).toHaveBeenCalledWith(5);
});
