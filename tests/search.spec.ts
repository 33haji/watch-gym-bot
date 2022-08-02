import { test } from '@playwright/test';

test('平日の夜に空きがあるかどうかチェック', async ({ page }) => {
  // 操作選択ページを表示
  await page.goto('https://user.shinjuku-shisetsu-yoyaku.jp/regasu/reserve/gin_menu');

  // 「かんたん操作」をクリック
  await page.locator('input[title="かんたん操作"]').click();

  // 「利用者ページへ」をクリック
  await page.locator('input[title="利用者ページへ"]').click();

  // IDとPASSを入力して「確定」をクリック
  const id = process.env.USER_ID as string;
  const password = process.env.USER_PASSWORD as string;
  await page.locator('input[name="g_riyoushabangou"]').fill(id);
  await page.locator('input[name="ansyono"]').fill(password);
  await page.locator('input[title="確定"]').click();

  // 「予約申込」をクリック
  await page.locator('input[title="予約申込"]').click();

  // 「屋内スポーツ施設」 → 「四谷スポーツスクエア」 → 「四谷スポーツスクエア多目的ホール」 → 「バレーボール」 → 「確定」の順にクリック
  await page.locator('a[title="屋内スポーツ施設"]').click();
  await page.locator('a[title="四谷スポーツスクエア"]').click();
  await page.locator('a[title="四谷スポーツスクエア多目的ホール"]').click();
  await page.locator('a[title="バレーボール"]').click();
  await page.locator('input[title="確定"]').click();

  // 「表示する日付を増やす」をクリック
  await page.locator('img[title="施設別に切替"]').click();
});
