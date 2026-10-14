import { DEVICE_PARAMS as p } from '../config/params';

export type DeviceMode = 'tank' | 'draw';

export interface DeviceInput {
  search: string;
  coarsePointer: boolean;
  /** Math.min(screen.width, screen.height) in CSS px. */
  screenShortSide: number;
}

/** `?mode=draw|tank` wins; otherwise touch-first small screens (phones) draw and everything else shows the tank. */
export function resolveDeviceMode({ search, coarsePointer, screenShortSide }: DeviceInput): DeviceMode {
  const forced = new URLSearchParams(search).get('mode');
  if (forced === 'draw' || forced === 'tank') return forced;
  return coarsePointer && screenShortSide < p.phoneMaxShortSide ? 'draw' : 'tank';
}
