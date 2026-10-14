import { expect, it, vi } from 'vitest';
import { createNotice } from '../../src/ui/notice';

it('keeps corner styling, replaces messages, expires and cleans up', () => {
  vi.useFakeTimers();
  try {
    const element = { style: {}, hidden: false, textContent: '', setAttribute: vi.fn(), remove: vi.fn() };
    const doc = { createElement: vi.fn(() => element), body: { append: vi.fn() } };
    const notice = createNotice(doc as unknown as Document);
    expect(element.setAttribute).toHaveBeenCalledWith('role', 'status');
    expect(element.style).toMatchObject({ right: '16px', bottom: '16px', width: 'max-content',
      maxWidth: 'calc(100vw - 32px)', pointerEvents: 'none' });
    expect(element.style).not.toHaveProperty('left');
    expect(element.hidden).toBe(true);
    notice.showNotice('第一則'); vi.advanceTimersByTime(4000);
    notice.showNotice('第二則'); vi.advanceTimersByTime(1000);
    expect(element.textContent).toBe('第二則'); expect(element.hidden).toBe(false);
    vi.advanceTimersByTime(4000); expect(element.hidden).toBe(true);
    notice.showNotice('第三則'); notice.dispose(); notice.dispose();
    expect(vi.getTimerCount()).toBe(0); expect(element.remove).toHaveBeenCalledOnce();
    notice.showNotice('已釋放'); expect(element.hidden).toBe(true);
  } finally { vi.useRealTimers(); }
});
