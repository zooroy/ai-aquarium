import { HAND_PARAMS as p } from '../../config/params';

export class OneEuroFilter {
  private time: number | undefined;
  private raw = 0;
  private value = 0;
  private derivative = 0;
  constructor(private readonly options: { minCutoff: number; beta: number; dCutoff: number } = p) {}
  filter(value: number, timestampSec: number): number {
    if (this.time === undefined) {
      this.time = timestampSec; this.raw = this.value = value; return value;
    }
    const dt = timestampSec - this.time;
    if (dt <= 0) return this.value;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.derivative += alpha(this.options.dCutoff) * ((value - this.raw) / dt - this.derivative);
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(this.derivative);
    this.value += alpha(cutoff) * (value - this.value);
    this.raw = value; this.time = timestampSec;
    return this.value;
  }
  reset(): void { this.time = undefined; this.raw = this.value = this.derivative = 0; }
}
