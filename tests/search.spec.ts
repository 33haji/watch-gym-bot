import { test } from '@playwright/test';

test('空きがあるかどうかチェック', async ({ page }) => {
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

  // 曜日と時間で空きがあるかチェック
  const messages: string[] = [];
  // 対象の月の中で空きがあるかチェックする関数
  async function checkAvailableDatetime() {
    const tableRows = await page.locator('tr');
    const tableRowsLength = await tableRows.count();
    // 一行目は時刻の行なので除く
    for (let i = 1; i < tableRowsLength; i++) {
      const date = (await tableRows.nth(i).first().innerText()).trim() || '';
      const isWeekend = ['土', '日'].some(str => date.includes(str));
      const cols = await tableRows.nth(i).locator('td');
      const colsLength = await cols.count();
      const titleRegexp = new RegExp('.+title="(.)".*');
      let isAvailable = false;
      let time = '';
      const TIMES = ['09:00~12:00', '12:20~15:20', '15:40~18:40', '19:00~22:00'];
      if (isWeekend) {
        // 休日の場合は全ての時刻をチェック
        for (let j = 0; j < colsLength; j++) {
          const targetElementInnerHtml = await cols.nth(j).first().innerHTML();
          const targetElementTitle = targetElementInnerHtml.match(titleRegexp)?.[1] || '';
          isAvailable = targetElementTitle === 'O';
          time = TIMES[j];
          if (isAvailable) break;
        }
      } else {
        // 平日の場合は19:00~22:00のみチェック
        const targetElementInnerHtml = await cols.nth(3).first().innerHTML();
        const targetElementTitle = targetElementInnerHtml.match(titleRegexp)?.[1] || '';
        isAvailable = targetElementTitle === 'O';
        time = TIMES[3];
      }
      if (isAvailable) {
        messages.push(`${date}の${time}に空きがあります！`);
      }
    }
    // 「次月」がある場合は次月へ遷移して再びチェック
    const nextMonthBtn = await page.locator('input[title="次月"]');
    const nextMonthBtnCount = await nextMonthBtn.count();
    if (nextMonthBtnCount > 0) {
      await nextMonthBtn.click();
      await checkAvailableDatetime();
    }
  }

  // 再起的に関数を呼び出して全ての月をチェックする
  await checkAvailableDatetime();

  // FIXME: Slackで送信する処理を実装する
  console.dir(messages);
});
