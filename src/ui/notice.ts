import { PALETTE } from '../config/palette';
import { ONBOARDING_PARAMS as p } from '../config/params';

/** Reusable corner notice. Each owner disposes its element and pending timeout. */
export function createNotice(doc: Document = document) {
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const element = doc.createElement('div');
  element.setAttribute('role', 'status'); element.hidden = true;
  Object.assign(element.style, {
    position: 'fixed', bottom: `${p.noticeInset}px`, right: `${p.noticeInset}px`,
    width: 'max-content', maxWidth: `calc(100vw - ${p.noticeInset * 2}px)`,
    boxSizing: 'border-box', overflowWrap: 'anywhere', zIndex: '21',
    padding: `${p.noticePadding}px`, borderRadius: `${p.noticeRadius}px`,
    background: `${hex(PALETTE.sand)}ee`, color: hex(PALETTE.debugBackground),
    boxShadow: '0 8px 32px #233b3b33', pointerEvents: 'none', fontFamily: 'system-ui',
  });
  doc.body.append(element);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function hide(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined; element.hidden = true; element.textContent = '';
  }
  return {
    showNotice(message: string): void {
      if (disposed) return;
      hide();
      if (!message) return;
      element.textContent = message; element.hidden = false;
      timer = setTimeout(hide, p.noticeSeconds * 1000);
    },
    hide,
    dispose(): void { if (disposed) return; disposed = true; hide(); element.remove(); },
  };
}
