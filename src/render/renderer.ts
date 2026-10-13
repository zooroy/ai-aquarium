import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { RENDER_PARAMS, TANK_PARAMS } from '../config/params';
import { computeTankBounds } from '../core/tank-bounds';
import type { TankBounds } from '../core/tank-bounds';

/** Three.js 此版本需要 WebGL2；使用同一 canvas，避免建立額外 context。 */
export function supportsWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.getContext('webgl2', { antialias: true }) !== null;
  } catch {
    return false;
  }
}

export class AquariumRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(TANK_PARAMS.cameraFov, 1, RENDER_PARAMS.near, RENDER_PARAMS.far);
  private readonly renderer: WebGLRenderer;
  private bounds!: TankBounds;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    const position = TANK_PARAMS.cameraPosition;
    this.camera.position.set(position.x, position.y, position.z);
    const target = RENDER_PARAMS.lookAt;
    this.camera.lookAt(target.x, target.y, target.z);
    this.camera.updateMatrixWorld();
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  getBounds(): TankBounds { return this.bounds; }

  readonly projectToScreen = (worldPos: Vector3): { x: number; y: number } => {
    const point = worldPos.clone().project(this.camera);
    // NDC 轉為左上原點的正規化座標，畫面外點夾在 0..1。
    return { x: Math.max(0, Math.min(1, (point.x + 1) / 2)), y: Math.max(0, Math.min(1, (1 - point.y) / 2)) };
  };

  readonly resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER_PARAMS.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.bounds = computeTankBounds({ fovDeg: this.camera.fov, cameraZ: this.camera.position.z, aspect: this.camera.aspect });
  };

  render(): void { this.renderer.render(this.scene, this.camera); }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
