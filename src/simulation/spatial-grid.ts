import type { Vector3 } from 'three';
import { FISH_PARAMS } from '../config/params';
import type { Fish } from './fish-state';

/** rebuild 後、下一次位置更新前查詢；結果包含半徑邊界與自身。 */
export class SpatialGrid {
  private readonly cells = new Map<string, Fish[]>();
  readonly cellSize = FISH_PARAMS.perceptionRadius;

  rebuild(fish: readonly Fish[]): void {
    this.cells.clear();
    for (const item of fish) {
      const { x, y, z } = item.position;
      const key = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize), Math.floor(z / this.cellSize));
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    }
  }

  queryNeighbors(position: Vector3, radius: number): Fish[] {
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Expected finite nonnegative radius');
    const result: Fish[] = [];
    const size = this.cellSize;
    for (let x = Math.floor((position.x - radius) / size); x <= Math.floor((position.x + radius) / size); x++) {
      for (let y = Math.floor((position.y - radius) / size); y <= Math.floor((position.y + radius) / size); y++) {
        for (let z = Math.floor((position.z - radius) / size); z <= Math.floor((position.z + radius) / size); z++) {
          for (const fish of this.cells.get(this.key(x, y, z)) ?? []) {
            if (fish.position.distanceToSquared(position) <= radius * radius) result.push(fish);
          }
        }
      }
    }
    return result;
  }

  private key(x: number, y: number, z: number): string { return `${x},${y},${z}`; }
}
