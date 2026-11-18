import { test as base, expect } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`);
    const onConsole = (message: ConsoleMessage) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    try {
      await use();
    } finally {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
      expect(errors, '頁面不應出現 pageerror 或 console.error').toEqual([]);
    }
  }, { auto: true }],
});

export { expect } from '@playwright/test';
