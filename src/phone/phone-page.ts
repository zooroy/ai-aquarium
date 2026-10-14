import { PALETTE } from '../config/palette';
import { DRAWING_UI_PARAMS as ui } from '../config/params';
import { hexColor } from '../drawing/canvas-mapping';
import { createRelayClient } from '../relay/relay-client';
import type { RelayClient, UploadResult } from '../relay/relay-client';
import { isRoomCode } from '../relay/room-code';
import { createButton } from '../ui/cozy';
import { createDrawingEditor } from '../ui/drawing-editor';

export const PHONE_MESSAGES = {
  noRoom: '請用桌電魚缸上「用手機畫」的 QR code 打開這一頁。',
  hint: '在魚的輪廓裡塗上顏色，畫好後送進魚缸。',
  sending: '傳送中…',
  sentTitle: '送出了！',
  sentBody: '你的魚幾秒後就會游進魚缸。',
  offline: '連不上網路，請確認網路後按「重試」。',
  roomFull: '魚缸暫時收不下更多魚，請稍後再送。',
  failed: '送出失敗，請再試一次。',
} as const;

export function failureMessage(reason: Exclude<UploadResult, { ok: true }>['reason']): string {
  if (reason === 'offline') return PHONE_MESSAGES.offline;
  if (reason === 'room-full') return PHONE_MESSAGES.roomFull;
  return PHONE_MESSAGES.failed;
}

function text(tag: 'h1' | 'p', content: string, style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = content;
  Object.assign(element.style, style);
  return element;
}

/** Full-screen drawing page for phones: draw, then upload to the paired tank's room. */
export function startPhonePage(search: string, client: Pick<RelayClient, 'upload'> = createRelayClient()) {
  const root = document.createElement('main');
  Object.assign(root.style, {
    position: 'fixed', inset: '0', overflowX: 'hidden', overflowY: 'auto', boxSizing: 'border-box',
    padding: 'max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))',
    background: hexColor(PALETTE.water), color: hexColor(PALETTE.debugBackground), fontFamily: 'system-ui', lineHeight: '1.5',
  });
  const card = document.createElement('section');
  Object.assign(card.style, {
    boxSizing: 'border-box', width: '100%', maxWidth: `${ui.panelMaxWidth}px`, margin: '0 auto', padding: '16px',
    borderRadius: '24px', background: `${hexColor(PALETTE.sand)}ee`, boxShadow: '0 8px 32px #233b3b33',
  });
  root.append(card);
  document.body.append(root);
  const title = text('h1', '畫一隻魚', { margin: '0 0 8px', fontSize: '22px' });

  const room = new URLSearchParams(search).get('room');
  if (!isRoomCode(room)) {
    card.append(title, text('p', PHONE_MESSAGES.noRoom, { margin: '0' }));
    return { dispose: () => root.remove() };
  }

  const editor = createDrawingEditor();
  const status = text('p', '', { margin: '12px 0 0', minHeight: '1.5em', fontSize: '15px' });
  status.setAttribute('role', 'status');
  const submit = createButton('送進魚缸', true);
  Object.assign(submit.style, { width: '100%', minHeight: '48px', marginTop: '12px', fontSize: '17px' });
  const drawingView = document.createElement('div');
  drawingView.append(text('p', PHONE_MESSAGES.hint, { margin: '0 0 12px', fontSize: '14px' }), editor.element, status, submit);

  const again = createButton('再畫一隻', true);
  Object.assign(again.style, { width: '100%', minHeight: '48px', marginTop: '16px', fontSize: '17px' });
  const sentView = document.createElement('div');
  sentView.append(text('p', PHONE_MESSAGES.sentTitle, { margin: '8px 0 0', fontSize: '28px', fontWeight: '700' }), text('p', PHONE_MESSAGES.sentBody, { margin: '4px 0 0' }), again);
  sentView.hidden = true;
  card.append(title, drawingView, sentView);

  let sending = false;
  submit.addEventListener('click', () => { void send(); });
  again.addEventListener('click', () => {
    editor.reset();
    status.textContent = ''; submit.textContent = '送進魚缸';
    sentView.hidden = true; drawingView.hidden = false;
  });

  async function send(): Promise<void> {
    if (sending) return;
    sending = true; submit.disabled = true; submit.textContent = PHONE_MESSAGES.sending; status.textContent = '';
    try {
      const result = await client.upload(room as string, await editor.exportPng());
      if (result.ok) {
        drawingView.hidden = true; sentView.hidden = false;
        submit.textContent = '送進魚缸';
      } else {
        status.textContent = failureMessage(result.reason); submit.textContent = '重試';
      }
    } catch (error) {
      console.warn('送出魚失敗', error);
      status.textContent = PHONE_MESSAGES.failed; submit.textContent = '重試';
    } finally {
      sending = false; submit.disabled = false;
    }
  }

  editor.reset();
  return { dispose: () => { editor.dispose(); root.remove(); } };
}
