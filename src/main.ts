import { App } from './app';
import { resolveSeed } from './core/random';
import { supportsWebGL } from './render/renderer';

const canvas = document.querySelector<HTMLCanvasElement>('#aquarium');
function showMessage(message: string): void {
  const notice = document.createElement('p');
  notice.setAttribute('role', 'alert');
  notice.textContent = message;
  if (canvas) canvas.replaceWith(notice);
  else document.body.append(notice);
}

if (!canvas || !supportsWebGL(canvas)) {
  showMessage('此頁面需要支援 WebGL 的瀏覽器');
} else {
  try {
    const app = new App(canvas, resolveSeed(location.search));
    if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
  } catch (error) {
    console.error('水族館初始化失敗', error);
    showMessage('水族館初始化失敗，請確認瀏覽器支援 WebGL 後重新載入');
  }
}
