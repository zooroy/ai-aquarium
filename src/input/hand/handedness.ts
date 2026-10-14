import { HAND_PARAMS } from '../../config/params';
import type { HandClassification, HandSide } from './types';
export function labelToHand(categoryName:string,invert:boolean=HAND_PARAMS.invertHandednessLabel):HandSide|null {
  if(categoryName!=='Left'&&categoryName!=='Right') return null;
  const left=categoryName==='Left';return left!==invert?'left':'right';
}
/** First confident label initializes; switching requires consecutive confident frames. */
export class HandednessFilter {
  private stable:HandSide|null=null;
  private candidate:HandSide|null=null;
  private count=0;
  update(label:HandClassification|undefined):HandSide|null {
    const side=label&&Number.isFinite(label.score)&&label.score>=HAND_PARAMS.handednessMinScore?labelToHand(label.categoryName):null;
    if(!side||side===this.stable) {this.candidate=null;this.count=0;return this.stable;}
    if(this.stable===null) {this.stable=side;return side;}
    if(side!==this.candidate) {this.candidate=side;this.count=0;}
    if(++this.count>=HAND_PARAMS.handednessSwitchFrames) {this.stable=side;this.candidate=null;this.count=0;}
    return this.stable;
  }
  reset():void {this.stable=null;this.candidate=null;this.count=0;}
}
