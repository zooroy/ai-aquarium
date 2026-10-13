import type { Random } from '../../core/random';
import type { TankBounds } from '../../core/tank-bounds';

export interface EnvironmentContext {
  getBounds(): TankBounds;
  random: Random;
}

export interface EnvironmentModule {
  update(time: number): void;
  dispose(): void;
}

export interface GroundContext extends EnvironmentContext {
  getHeight(x: number, z: number): number;
}
