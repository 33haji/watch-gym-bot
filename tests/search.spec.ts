import { test } from '@playwright/test';

test('平日の夜に空きがあるかどうかチェック', async ({ page }) => {
  // 操作選択ページを表示
  await page.goto('https://user.shinjuku-shisetsu-yoyaku.jp/regasu/reserve/gin_menu');

  // 「かんたん操作」をクリック
  await page.locator('input[title="かんたん操作"]').click();

  // 「利用者ページへ」をクリック
  await page.locator('input[title="利用者ページへ"]').click();
});
