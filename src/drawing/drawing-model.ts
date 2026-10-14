import { CUSTOM_FISH_PARAMS as p } from '../config/params';
import { PALETTE } from '../config/palette';
import type { UvPoint } from './fish-template';

export interface Stroke { color: number | 'erase'; size: 'small' | 'medium' | 'large'; points: { u: number; v: number }[] }
export interface Drawing { template: 'default'; base: number; strokes: Stroke[] }
export type DrawingAction = { type: 'stroke'; stroke: Stroke } | { type: 'clear' };
export interface DrawingState {
  base: number;
  /** Ordered, non-undoable commands representing a future raster base. */
  mergedStrokes: readonly Stroke[];
  history: readonly DrawingAction[];
  active: Stroke | null;
}
export function createDrawing(base: number = PALETTE.customFishBase): DrawingState {
  return { base, mergedStrokes: [], history: [], active: null };
}
const cloneStroke = (stroke: Stroke): Stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) });
function point(value: UvPoint): UvPoint {
  if (!Number.isFinite(value.u) || !Number.isFinite(value.v)) throw new RangeError('Drawing coordinates must be finite');
  return { u: Math.max(0, Math.min(1, value.u)), v: Math.max(0, Math.min(1, value.v)) };
}
export function beginStroke(state: DrawingState, color: Stroke['color'], size: Stroke['size'], start: UvPoint): DrawingState {
  // Beginning another stroke commits the previous one, never silently loses it.
  return { ...endStroke(state), active: { color, size, points: [point(start)] } };
}
export function extendStroke(state: DrawingState, end: UvPoint): DrawingState {
  if (!state.active) return state;
  const next = point(end), previous = state.active.points[state.active.points.length - 1];
  const distance = Math.hypot((next.u - previous.u) * p.textureWidth, (next.v - previous.v) * p.textureHeight);
  if (distance === 0) return state;
  const steps = Math.ceil(distance / (p.brushSizes[state.active.size] * p.interpolationRadiusRatio));
  const added = Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps;
    return { u: previous.u + (next.u - previous.u) * t, v: previous.v + (next.v - previous.v) * t };
  });
  return { ...state, active: { ...state.active, points: [...state.active.points, ...added] } };
}
function commit(state: DrawingState, action: DrawingAction): DrawingState {
  const history = [...state.history, action];
  let mergedStrokes = state.mergedStrokes;
  while (history.length > p.maxUndoActions) {
    const oldest = history.shift()!;
    mergedStrokes = oldest.type === 'clear' ? [] : [...mergedStrokes, oldest.stroke];
  }
  return { ...state, mergedStrokes, history, active: null };
}
export function endStroke(state: DrawingState): DrawingState {
  return state.active ? commit(state, { type: 'stroke', stroke: state.active }) : state;
}
export function clearDrawing(state: DrawingState): DrawingState {
  return commit(endStroke(state), { type: 'clear' });
}
export function undo(state: DrawingState): DrawingState {
  if (state.active) return { ...state, active: null };
  return { ...state, history: state.history.slice(0, -1) };
}
/** Snapshot for rendering: replay base strokes first, with erase strokes preserving order. */
export function getDrawing(state: DrawingState): Drawing {
  let strokes = [...state.mergedStrokes];
  for (const action of state.history) {
    if (action.type === 'clear') strokes = [];
    else strokes.push(action.stroke);
  }
  if (state.active) strokes.push(state.active);
  return { template: 'default', base: state.base, strokes: strokes.map(cloneStroke) };
}
