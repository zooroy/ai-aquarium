import { PHONE_MESSAGES } from '../../src/phone/phone-page';
import { test, expect } from './fixtures';

test('畫圖頁在沒有轉交設定時載入', async ({ page }) => {
  await page.goto('/?mode=draw');
  await expect(page.locator('#aquarium')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '畫一隻魚', exact: true })).toBeVisible();
  await expect(page.getByText(PHONE_MESSAGES.unavailable, { exact: true })).toBeVisible();
});
