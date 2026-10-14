import { CUSTOM_FISH_PARAMS as p, DRAWING_UI_PARAMS as ui } from '../config/params';
import { PALETTE } from '../config/palette';
import { brushPixels, hexColor, uvToCanvas } from '../drawing/canvas-mapping';
import type { Drawing } from '../drawing/drawing-model';
import { fishSilhouetteTriangles } from '../drawing/fish-template';

const W: number = p.textureWidth, H: number = p.textureHeight;

function canvas2d(width: number = W, height: number = H): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return [canvas, ctx];
}

let maskCache: HTMLCanvasElement | undefined;
/** Opaque inside the fish silhouette, transparent outside, built from the same triangles as the 3D fish. */
export function fishMask(): HTMLCanvasElement {
  if (maskCache) return maskCache;
  const [canvas, ctx] = canvas2d();
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
  for (const triangle of fishSilhouetteTriangles()) {
    const [a, b, c] = triangle.map((point) => uvToCanvas(point, W, H));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath();
    // The stroke closes hairline seams between adjacent projected triangles.
    ctx.fill(); ctx.stroke();
  }
  maskCache = canvas;
  return canvas;
}

/** Paints base colour everywhere, then the strokes clipped to the silhouette, so the texture has no transparent pixels. */
export function paintDrawing(target: CanvasRenderingContext2D, drawing: Drawing): void {
  const [layer, ctx] = canvas2d();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of drawing.strokes) {
    const color = hexColor(stroke.color === 'erase' ? drawing.base : stroke.color);
    const width = brushPixels(stroke.size, W);
    const points = stroke.points.map((point) => uvToCanvas(point, W, H));
    if (points.length === 1) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(fishMask(), 0, 0);
  target.save();
  target.globalCompositeOperation = 'source-over';
  target.fillStyle = hexColor(drawing.base); target.fillRect(0, 0, W, H);
  target.drawImage(layer, 0, 0);
  target.restore();
}

/** Display version: the fish clipped to its silhouette with a soft outline, on a transparent background. */
export function drawFishPreview(target: CanvasRenderingContext2D, source: CanvasImageSource): void {
  const width = target.canvas.width, height = target.canvas.height, mask = fishMask();
  const [outline, octx] = canvas2d(width, height);
  const offset = ui.outlineWidth * width / W;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    octx.drawImage(mask, dx * offset, dy * offset, width, height);
  }
  octx.globalCompositeOperation = 'source-in'; octx.fillStyle = hexColor(PALETTE.debugBackground); octx.fillRect(0, 0, width, height);
  const [fish, fctx] = canvas2d(width, height);
  fctx.drawImage(source, 0, 0, width, height);
  fctx.globalCompositeOperation = 'destination-in'; fctx.drawImage(mask, 0, 0, width, height);
  target.clearRect(0, 0, width, height);
  target.drawImage(outline, 0, 0); target.drawImage(fish, 0, 0);
}

export function exportDrawingPng(drawing: Drawing): Promise<Blob> {
  const [canvas, ctx] = canvas2d();
  paintDrawing(ctx, drawing);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'));
}

export { canvas2d };
