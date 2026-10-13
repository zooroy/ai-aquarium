import { CursorRenderer } from './render/cursor-renderer';
import { FishRenderer } from './render/fish/fish-renderer';
import { createCaustics } from './render/environment/caustics';
import { createBubbles } from './render/environment/bubbles';
import { createSeaweed } from './render/environment/seaweed';
import { createCoral } from './render/environment/coral';
import { createRocks } from './render/environment/rocks';
import { createFpsOverlay } from './debug/fps-overlay';
import { FISH_PARAMS, SIMULATION_PARAMS } from './config/params';
import { createRandom } from './core/random';
import { InputManager } from './input/input-manager';
import { PointerProvider } from './input/pointer-provider';
import { createSchool } from './simulation/fish-state';
import { stepSchool } from './simulation/boids';
import { AquariumRenderer } from './render/renderer';
import { createLighting } from './render/environment/lighting';
import { createSand } from './render/environment/sand';
import type { EnvironmentModule } from './render/environment/types';
import type { Fish } from './simulation/fish-state';

export class App {
  private readonly renderer: AquariumRenderer;
  private readonly input = new InputManager();
  private readonly pointer = new PointerProvider();
  private readonly fish: Fish[];
  private readonly environment: EnvironmentModule[] = [];
  private frameId: number | undefined;
  private previousTime: number | undefined;
  private time = 0;
  private cursorRenderer: CursorRenderer | undefined;
  private fishRenderer: FishRenderer | undefined;
  private overlay: ReturnType<typeof createFpsOverlay> | undefined;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.renderer = new AquariumRenderer(canvas);
    try {
      const random = createRandom(seed);
      this.fish = createSchool(FISH_PARAMS.count, this.renderer.getBounds(), random);
      this.fishRenderer = new FishRenderer(this.renderer.scene, this.fish.length);
      this.cursorRenderer = new CursorRenderer(this.renderer.scene, this.renderer.camera);
      const ctx = { getBounds: () => this.renderer.getBounds(), random };
      this.environment.push(createLighting(this.renderer.scene, ctx));
      const sand = createSand(this.renderer.scene, ctx);
      this.environment.push(sand);
      const ground = { ...ctx, getHeight: sand.getHeight };
      this.environment.push(createRocks(this.renderer.scene, ground));
      this.environment.push(createCoral(this.renderer.scene, ground));
      this.environment.push(createSeaweed(this.renderer.scene, ground));
      this.environment.push(createBubbles(this.renderer.scene, ground));
      this.environment.push(createCaustics(this.renderer.scene, { ...ctx, sand }));
      this.overlay = createFpsOverlay(location.search);
      this.input.register(this.pointer);
      this.pointer.start(canvas);
      this.frameId = requestAnimationFrame(this.frame);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private readonly frame = (timestamp: number): void => {
    const dt = this.previousTime === undefined ? 0 : Math.min((timestamp - this.previousTime) / 1000, SIMULATION_PARAMS.maxDeltaTime);
    this.previousTime = timestamp;
    this.time += dt;
    const state = this.input.getState();
    stepSchool(this.fish, dt, {
      bounds: this.renderer.getBounds(), time: this.time,
      pointers: state.pointers, projectToScreen: this.renderer.projectToScreen,
    });
    this.fishRenderer?.sync(this.fish, this.time);
    for (const module of this.environment) module.update(this.time);
    this.cursorRenderer?.sync(state, dt);
    this.renderer.render();
    this.overlay?.update(timestamp);
    this.frameId = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.frameId = undefined;
    this.pointer.stop();
    this.overlay?.dispose();
    this.fishRenderer?.dispose();
    this.cursorRenderer?.dispose();
    for (const module of [...this.environment].reverse()) module.dispose();
    this.environment.length = 0;
    this.renderer.dispose();
  }
}
