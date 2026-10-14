import { PALETTE } from '../config/palette';
import { ONBOARDING_PARAMS } from '../config/params';
import { startCameraSession } from './camera-session';
import type { CameraDependencies, CameraFailure, DetectionStats } from './camera-session';
import type { HandFrame } from '../input/hand/types';

export type OnboardingState = 'choosing' | 'loading' | 'mouse' | 'camera';
export const CAMERA_MESSAGES: Record<CameraFailure, string> = {
  permission: '鏡頭權限被拒絕，已改用滑鼠操作。',
  missing: '找不到鏡頭，已改用滑鼠操作。',
  insecure: '此頁面需要 HTTPS 或 localhost 才能使用鏡頭，已改用滑鼠操作。',
  model: '手部追蹤模型或 WASM 載入失敗，已改用滑鼠操作。',
  unknown: '鏡頭暫時無法使用，已改用滑鼠操作。',
};
export interface OnboardingCallbacks {
  changed(state: OnboardingState, notice: string): void;
  ingest(frame: HandFrame | null, now: number): void;
  report(stats: DetectionStats | undefined): void;
  clearHand(): void;
}
/** 可注入控制器，DOM 僅訂閱狀態；載入完成後仍持有 session 供 dispose。 */
export function createOnboardingController(callbacks: OnboardingCallbacks, deps?: CameraDependencies) {
  let state: OnboardingState = 'choosing', disposed = false;
  let session: ReturnType<typeof startCameraSession> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const change = (next: OnboardingState, notice = '') => { state = next; callbacks.changed(state, notice); };
  change('choosing');
  return {
    mouse() { if (!disposed && state === 'choosing') change('mouse'); },
    camera() {
      if (disposed || state !== 'choosing') return;
      change('loading');
      session = startCameraSession({
        ready() { if (!disposed) change('camera'); },
        failed(reason) {
          if (disposed) return;
          callbacks.clearHand(); callbacks.report(undefined); change('mouse', CAMERA_MESSAGES[reason]);
          timer = setTimeout(() => { if (!disposed) change('mouse'); }, ONBOARDING_PARAMS.noticeSeconds * 1000);
        }, ingest: callbacks.ingest, report: callbacks.report,
      }, deps);
    },
    dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer); session?.dispose(); callbacks.clearHand(); callbacks.report(undefined); },
  };
}

export function createOnboarding(callbacks: Omit<OnboardingCallbacks, 'changed'>) {
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', zIndex: '20', cursor: 'default' });
  for (const type of ['pointerdown','pointerup','pointermove','pointercancel','click']) layer.addEventListener(type, (event) => event.stopPropagation());
  const card = document.createElement('section'); card.setAttribute('role','dialog'); card.setAttribute('aria-label','選擇遊玩方式');
  Object.assign(card.style, { maxWidth: '420px', margin: '20px', padding: '28px', borderRadius: '24px', background: `${hex(PALETTE.sand)}ee`, color: hex(PALETTE.debugBackground), boxShadow: '0 8px 32px #233b3b33', fontFamily: 'system-ui', lineHeight: '1.7' });
  const text = document.createElement('p'); text.textContent = '伸出手捏住小魚，或用滑鼠與牠們一起玩。';
  const privacy = document.createElement('p'); privacy.textContent = '鏡頭影像只在瀏覽器中處理，不上傳也不儲存';
  const camera = document.createElement('button'); camera.textContent = '開啟鏡頭';
  const mouse = document.createElement('button'); mouse.textContent = '用滑鼠玩';
  for (const button of [camera,mouse]) Object.assign(button.style, { cursor: 'pointer', background: hex(PALETTE.water), border: '0', borderRadius: '12px', padding: '12px 18px', margin: '4px', color: hex(PALETTE.debugBackground), font: 'inherit' });
  const loading = document.createElement('p'); loading.textContent = '正在開啟鏡頭與載入手部追蹤…'; loading.hidden = true; loading.setAttribute('role','status');
  card.append(text,privacy,camera,mouse,loading); layer.append(card); document.body.append(layer);
  const notice = document.createElement('div'); notice.setAttribute('role','status'); notice.hidden = true;
  Object.assign(notice.style, {
    position: 'fixed', bottom: `${ONBOARDING_PARAMS.noticeInset}px`, right: `${ONBOARDING_PARAMS.noticeInset}px`,
    width: 'max-content', maxWidth: `calc(100vw - ${ONBOARDING_PARAMS.noticeInset * 2}px)`,
    boxSizing: 'border-box', overflowWrap: 'anywhere', zIndex: '21',
    padding: `${ONBOARDING_PARAMS.noticePadding}px`, borderRadius: `${ONBOARDING_PARAMS.noticeRadius}px`,
    background: `${hex(PALETTE.sand)}ee`, color: hex(PALETTE.debugBackground),
    boxShadow: card.style.boxShadow, pointerEvents: 'none', fontFamily: 'system-ui',
  });
  document.body.append(notice);
  const controller = createOnboardingController({ ...callbacks, changed(state,message) {
    layer.style.display = state === 'choosing' || state === 'loading' ? 'grid' : 'none';
    loading.hidden = state !== 'loading'; camera.disabled = mouse.disabled = state === 'loading';
    notice.textContent = message; notice.hidden = !message;
  } });
  camera.addEventListener('click', () => controller.camera()); mouse.addEventListener('click', () => controller.mouse());
  return { dispose() { controller.dispose(); layer.remove(); notice.remove(); } };
}
