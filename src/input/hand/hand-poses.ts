import type { Landmark } from './types';
// 掌根到中指根約8cm；表格於輸出時反轉 x 成未鏡像相機中的右手（拇指在右）。
export const OPEN_POSE: readonly (readonly number[])[] = [
  [0, .08, 0], [-.035,.055,0],[-.06,.025,0],[-.08,0,0],[-.10,-.02,0],
  [-.03,0,0],[-.035,-.035,0],[-.035,-.06,0],[-.035,-.08,0],
  [0,0,0],[0,-.04,0],[0,-.07,0],[0,-.095,0],
  [.025,.005,0],[.03,-.035,0],[.03,-.06,0],[.03,-.08,0],
  [.045,.02,0],[.055,-.01,0],[.06,-.035,0],[.065,-.05,0],
];
const PINCH = OPEN_POSE.map((point) => [...point]);
PINCH[2] = [-.05,.01,-.01]; PINCH[3] = [-.035,-.02,-.02]; PINCH[4] = [-.022,-.04,-.025];
PINCH[6] = [-.03,-.03,-.01]; PINCH[7] = [-.025,-.045,-.02]; PINCH[8] = [-.018,-.04,-.025];


export const PINCH_POSE: readonly (readonly number[])[] = PINCH;
// Curl each segment with its authored length in the camera y/z plane.
const fist = OPEN_POSE.map(point => [...point]);
for(const base of [5,9,13,17]) {
  const directions = [[0,-.6,-.8],[0,.8,-.6],[0,.8,.6]];
  for(let k=0;k<3;k++) {
    const length=Math.hypot(...OPEN_POSE[base+k+1].map((v,a)=>v-OPEN_POSE[base+k][a]));
    fist[base+k+1]=fist[base+k].map((v,a)=>v+directions[k][a]*length);
  }
}
// Thumb crosses the curled fingers, preserving authored segment lengths.
for(let k=1;k<4;k++) {
  const direction = k===1?[.2,-.8,-.56]:[.8,-.2,-.56];
  const norm=Math.hypot(...direction);
  const length=Math.hypot(...OPEN_POSE[k+1].map((v,a)=>v-OPEN_POSE[k][a]));
  fist[k+1]=fist[k].map((v,a)=>v+direction[a]/norm*length);
}
export const FIST_POSE: readonly (readonly number[])[] = fist;
export function blendPose(pinch: number, fist: number): Landmark[] {
  pinch=Math.max(0,Math.min(1,pinch));fist=Math.max(0,Math.min(1,fist));
  return OPEN_POSE.map((point,i)=>{
    const values=point.map((v,a)=>v+pinch*(1-fist)*(PINCH_POSE[i][a]-v)+fist*(FIST_POSE[i][a]-v));
    return {x:-values[0],y:values[1],z:values[2]};
  });
}
