import { HandAvatar } from './render/hand/hand-avatar';
import { HandProvider } from './input/hand/hand-provider';
import { createReplaySource, getReplayScript } from './input/hand/replay-source';
import { shouldDetectFrame } from './input/hand/detection-timing';
import { GrabController } from './simulation/grab';
import { startCameraDebug } from './debug/camera-debug';
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
  private readonly handProvider = new HandProvider();
  private readonly grab = new GrabController();
  private handAvatar: HandAvatar | undefined;
  private replay: ReturnType<typeof createReplaySource> | undefined;
  private replayStart: number | undefined;
  private lastReplay = -Infinity;
  private stopCameraDebug: (() => void) | undefined;
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
      this.handAvatar = new HandAvatar(this.renderer.scene, this.renderer.camera);
      this.input.register(this.handProvider);
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
      const query = new URLSearchParams(location.search);
      if (query.has('handReplay')) {
        this.replay = createReplaySource(getReplayScript(query.get('handReplay')!));
      } else if (query.has('debug') && query.has('camera')) {
        this.stopCameraDebug = startCameraDebug((stats) => this.overlay?.setDetection(stats), (frame, now) => this.handProvider.ingest(frame, now));
      }
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
    if (this.replay) {
      this.replayStart ??= timestamp;
      if (shouldDetectFrame(timestamp, this.lastReplay)) {
        this.handProvider.ingest(this.replay.frameAt(timestamp - this.replayStart), timestamp);
        this.lastReplay = timestamp;
      }
    }
    this.handProvider.update(timestamp);
    const state = this.input.getState();
    this.grab.update(state, this.fish, dt, {
      bounds: this.renderer.getBounds(), projectToScreen: this.renderer.projectToScreen,
      screenToWorld: this.renderer.screenToWorld, aspect: this.renderer.aspect,
    });
    stepSchool(this.fish, dt, {
      bounds: this.renderer.getBounds(), time: this.time,
      pointers: state.pointers, projectToScreen: this.renderer.projectToScreen,
    });
    this.fishRenderer?.sync(this.fish, this.time);
    this.handAvatar?.sync(this.handProvider.getHandPose(), dt, this.renderer.screenToWorld);
    for (const module of this.environment) module.update(this.time);
    this.cursorRenderer?.sync(state, dt);
    this.renderer.render();
    this.overlay?.setInteraction(this.fish, state);
    this.overlay?.update(timestamp);
    this.frameId = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.frameId = undefined;
    this.pointer.stop();
    this.stopCameraDebug?.();
    this.handProvider.stop();
    this.handAvatar?.dispose();
    this.overlay?.dispose();
    this.fishRenderer?.dispose();
    this.cursorRenderer?.dispose();
    for (const module of [...this.environment].reverse()) module.dispose();
    this.environment.length = 0;
    this.renderer.dispose();
  }
}
