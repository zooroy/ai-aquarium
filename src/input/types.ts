export type InputSource = 'mouse' | 'touch' | 'hand';

export interface Pointer {
  id: string;          // e.g. 'mouse', 'touch-3', 'hand-0'
  x: number;           // 0..1, left -> right
  y: number;           // 0..1, top -> bottom
  pressed: boolean;    // mouse button down / touching / pinching
  source: InputSource;
}

export interface InputState {
  pointers: readonly Pointer[];
}

export interface InputProvider {
  readonly name: string;
  start(target: HTMLElement): void;
  stop(): void;
  getPointers(): Pointer[];   // provider 自己的最新游標快照
}
