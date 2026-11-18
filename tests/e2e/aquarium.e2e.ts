import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function startWithMouse(page: Page) {
  await page.getByRole('button', { name: '用滑鼠玩', exact: true }).click();
  await page.getByRole('button', { name: '開始玩', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=1');
});

test('魚缸載入並持續繪製', async ({ page }) => {
  await expect(page.getByRole('button', { name: '用滑鼠玩', exact: true })).toBeVisible();
  const canvas = page.locator('#aquarium');
  const first = await canvas.screenshot();
  // 刻意等待動畫前進，再比對畫布內容，不使用像素快照基準。
  await page.waitForTimeout(500);
  const second = await canvas.screenshot();
  expect(first.equals(second)).toBe(false);
});

test('用滑鼠玩並關閉說明卡', async ({ page }) => {
  await startWithMouse(page);
  await expect(page.getByRole('dialog', { name: '選擇遊玩方式', exact: true })).toBeHidden();
  await expect(page.getByRole('dialog', { name: '操作說明', exact: true })).toBeHidden();
});

test('滑鼠操作不出錯', async ({ page }) => {
  await startWithMouse(page);
  const box = await page.locator('#aquarium').boundingBox();
  if (!box) throw new Error('找不到魚缸畫布');
  const x = box.x + box.width / 2 - 100;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 200, y, { steps: 20 });
  await page.mouse.up({ button: 'left' });
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1000);
  await page.mouse.up({ button: 'right' });
});
