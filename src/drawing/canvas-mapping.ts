import { CUSTOM_FISH_PARAMS as p } from '../config/params';
import type { Stroke } from './drawing-model';
import type { UvPoint } from './fish-template';

export interface Rect { left: number; top: number; width: number; height: number }

/** UV has v pointing up; canvas pixels have y pointing down. */
export function uvToCanvas(point: UvPoint, width: number = p.textureWidth, height: number = p.textureHeight): { x: number; y: number } {
  return { x: point.u * width, y: (1 - point.v) * height };
}

/** Converts a client-space pointer position inside the displayed canvas rect to clamped UV. */
export function clientToUv(clientX: number, clientY: number, rect: Rect): UvPoint {
  const u = (clientX - rect.left) / Math.max(rect.width, 1e-9);
  const v = 1 - (clientY - rect.top) / Math.max(rect.height, 1e-9);
  return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
}

/** Brush diameter in pixels for a canvas of the given width (sizes are defined at texture width). */
export function brushPixels(size: Stroke['size'], width: number = p.textureWidth): number {
  return p.brushSizes[size] * width / p.textureWidth;
}

export function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
