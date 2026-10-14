import { TANK_PARAMS } from '../config/params';

export interface TankBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface TankBoundsOptions {
  fovDeg: number;
  cameraZ: number;
  aspect: number;
}

/** 相機位於正 z 軸並看向原點；FOV 為垂直角度，aspect 為寬／高。 */
export function computeTankBounds({ fovDeg, cameraZ, aspect }: TankBoundsOptions): TankBounds {
  if (!Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180 ||
      !Number.isFinite(cameraZ) || cameraZ <= 0 ||
      !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('Expected 0 < fovDeg < 180, cameraZ > 0 and aspect > 0');
  }

  const halfHeight = Math.tan(fovDeg * Math.PI / 360) * cameraZ * TANK_PARAMS.visibleAreaRatio;
  const halfWidth = halfHeight * aspect;
  const height = halfHeight * 2;

  return {
    min: {
      x: -halfWidth,
      y: -halfHeight + height * TANK_PARAMS.bottomMarginRatio,
      z: TANK_PARAMS.minZ,
    },
    max: {
      x: halfWidth,
      y: halfHeight - height * TANK_PARAMS.topMarginRatio,
      z: TANK_PARAMS.maxZ,
    },
  };
}

/** World y of the screen's top edge at depth z (camera on the z axis, looking at the origin, vertical FOV). */
export function visibleTopY(fovDeg: number, cameraY: number, cameraZ: number, z: number): number {
  return cameraY + Math.tan(fovDeg * Math.PI / 360) * (cameraZ - z);
}

/** Half the visible world width at depth z; aspect is width / height. */
export function visibleHalfWidth(fovDeg: number, cameraZ: number, aspect: number, z: number): number {
  return Math.tan(fovDeg * Math.PI / 360) * (cameraZ - z) * aspect;
}
