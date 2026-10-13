import type { InputProvider, InputState } from './types';

export class InputManager {
  private readonly providers: InputProvider[] = [];

  register(provider: InputProvider): void {
    this.providers.push(provider);
  }

  getState(): InputState {
    return {
      pointers: this.providers.flatMap((provider) =>
        provider.getPointers().map((pointer) => ({ ...pointer }))),
    };
  }
}
