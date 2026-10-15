import type { InputProvider, Pointer } from './types';

const EVENT_TYPES = ['pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'pointerleave'] as const;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export class PointerProvider implements InputProvider {
  readonly name = 'pointer';
  private target: HTMLElement | undefined;
  private readonly pointers = new Map<string, Pointer>();
  private previousStyle: { touchAction: string; cursor: string } | undefined;

  start(target: HTMLElement): void {
    this.stop();
    this.target = target;
    this.previousStyle = { touchAction: target.style.touchAction, cursor: target.style.cursor };
    target.style.touchAction = 'none';
    target.style.cursor = 'none';
    target.addEventListener('contextmenu', this.handleContextMenu);
    for (const type of EVENT_TYPES) target.addEventListener(type, this.handlePointer);
  }

  stop(): void {
    if (this.target) {
      this.target.removeEventListener('contextmenu', this.handleContextMenu);
      for (const type of EVENT_TYPES) this.target.removeEventListener(type, this.handlePointer);
      if (this.previousStyle) {
        this.target.style.touchAction = this.previousStyle.touchAction;
        this.target.style.cursor = this.previousStyle.cursor;
      }
    }
    this.target = undefined;
    this.previousStyle = undefined;
    this.pointers.clear();
  }

  getPointers(): Pointer[] {
    return Array.from(this.pointers.values(), (pointer) => ({ ...pointer }));
  }

  private readonly handleContextMenu = (event: Event): void => { event.preventDefault(); };

  private readonly handlePointer = (event: PointerEvent): void => {
    if (!this.target) return;
    const touch = event.pointerType === 'touch';
    // D3 沒有 pen source；筆輸入比照 mouse，但保留不同 id。
    const id = touch ? `touch-${event.pointerId}` : event.pointerType === 'pen' ? 'pen' : 'mouse';
    if (event.type === 'pointercancel' ||
        (touch && event.type === 'pointerup') ||
        (!touch && event.type === 'pointerleave')) {
      this.pointers.delete(id);
      return;
    }
    // 觸控離開 target 時仍保持按下，直到 up/cancel 才移除。
    if (event.type === 'pointerleave') return;
    const rect = this.target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointers.set(id, {
      id,
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
      pressed: touch || ((event.buttons & 1) !== 0 && (event.buttons & 2) === 0),
      fist: !touch && (event.buttons & 2) !== 0,
      source: touch ? 'touch' : 'mouse',
    });
  };
}
