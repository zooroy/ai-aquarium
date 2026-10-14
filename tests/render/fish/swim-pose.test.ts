import { Matrix4, Quaternion, Vector3 } from 'three';
import { createNoise3D } from 'simplex-noise';
import { expect, it } from 'vitest';
import { createRandom } from '../../../src/core/random';
import { FISH_PARAMS, FISH_RENDER_PARAMS as p } from '../../../src/config/params';
import { createSchool, type Fish } from '../../../src/simulation/fish-state';
import { computeSwimPose } from '../../../src/render/fish/swim-pose';
const panicNoise = createNoise3D(createRandom(p.jitterSeed).next);
// Frozen pre-extraction FishRenderer calculation: regression oracle.
function original(item: Fish, time: number, dt: number, previousYaw?: number) {
      const x = item.forward.clone().normalize();
      const horizontal = Math.hypot(x.x, x.z);
      let yaw = previousYaw ?? (horizontal > p.poleThreshold ? Math.atan2(x.z, x.x) : 0);
      if (horizontal > p.poleThreshold) {
        const target = Math.atan2(x.z, x.x);
        const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
        yaw += Math.max(-p.yawRate * dt, Math.min(p.yawRate * dt, delta));
      }

      // 水平側向基底保留上一幀 yaw；垂直附近不以接近零的叉積決定方向。
      let z = new Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      z.addScaledVector(x, -z.dot(x));
      if (z.lengthSq() < 1e-8) z = new Vector3(0, 1, 0).cross(x);
      z.normalize();
      const y = z.clone().cross(x).normalize();
      const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
      const panic = Math.max(0, Math.min(1, item.panic));
      const position = item.position.clone();
      for (const [axis, offset] of [['x', 0], ['y', 1], ['z', 2]] as const) position[axis] += panic * p.jitterAmp * panicNoise(time * p.jitterFreq, item.id, offset);
      rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), panic * p.wobbleAngle * Math.sin(time * p.wobbleFreq + item.phase)));
      const matrix = new Matrix4().compose(position, rotation, new Vector3().setScalar(item.scale));
      const ratio = Math.max(0, Math.min(1, (item.velocity.length() - FISH_PARAMS.minSpeed) / (FISH_PARAMS.maxSpeed - FISH_PARAMS.minSpeed)));

 return { matrix, yaw, phase:item.phase,
 frequency:(p.minFreq+ratio*(p.maxFreq-p.minFreq))*(1+p.panicFreqGain*panic),
 amplitude:p.defaultAmp*(1+p.panicAmpGain*panic) };
}
it('matches original calculation across panic, speed, yaw wrap and poles without mutating fish',()=>{
  const fish=createSchool(12,{min:{x:-2,y:-2,z:-2},max:{x:2,y:2,z:2}},createRandom(42));
  for(const item of fish) for(const panic of [0,.4,1]) for(const previous of [undefined,-3.13,3.13]) {
    item.panic=panic;
    if(item.id%2===0) item.forward.set(.00001,1,0).normalize();
    const position=item.position.clone(),forward=item.forward.clone(),velocity=item.velocity.clone();
    expect(computeSwimPose(item,2,.016,previous)).toEqual(original(item,2,.016,previous));
    expect(item.position).toEqual(position);expect(item.forward).toEqual(forward);expect(item.velocity).toEqual(velocity);
  }
});
