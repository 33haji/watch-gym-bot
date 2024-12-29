import { test } from '@playwright/test';
import { postMessageToSlack } from '../utils';

// skipする日付
const SKIP_DATES = ['12/22', '12/24', '12/28', '1/11', '2/22'];
// 祝日
const HOLIDAYS = ['1/13', '2/11', '2/24', '3/20'];

test('空きがあるかどうかチェック', async ({ page }) => {
  // 対象の月の中で空きがあるかチェックする関数
  const messages: string[] = [];
  async function checkAvailableDatetime() {
    const tableRows = await page.locator('tr');
    const tableRowsLength = await tableRows.count();
    // 一行目は時刻の行なので除く
    for (let i = 1; i < tableRowsLength; i++) {
      const date = (await tableRows.nth(i).first().innerText()).trim() || '';
      if (SKIP_DATES.some(SKIP_DATE => date.includes(SKIP_DATE))) continue;
      const isWeekend = ['土', '日'].some(str => date.includes(str));
      const isHoliday = HOLIDAYS.some(HOLIDAY => date.includes(HOLIDAY));
      const cols = await tableRows.nth(i).locator('td');
      const colsLength = await cols.count();
      const titleRegexp = new RegExp('.+title="(.)".*');
      const TIMES = ['09:00~12:00', '12:20~15:20', '15:40~18:40', '19:00~22:00'];
      // 休日・祝日：全ての時刻をチェック
      // 平日：19:00~22:00のみチェック
      const initialIndex = isWeekend || isHoliday ? 0 : 3;
      for (let j = initialIndex; j < colsLength; j++) {
        // ○かどうか確認
        const targetElement = cols.nth(j).first();
        const targetElementInnerHtml = await targetElement.innerHTML();
        const targetElementTitle = targetElementInnerHtml.match(titleRegexp)?.[1] || '';
        const isAvailable = targetElementTitle === 'O';
        if (!isAvailable) continue;

        // 予約できる状態だった場合はmessagesに追加
        await targetElement.click();
        await page.waitForTimeout(1000);
        const heading3Element = await page.locator('h3');
        const heading3ElementCount = await heading3Element.count();
        const heading3InnerHTML = heading3ElementCount > 0 ? await heading3Element.innerHTML() : '';

        if (heading3InnerHTML.includes('選択した日付は照会のみ可能となっております。')) {
          // 予約できる状態ではないので元のページに戻る
          const confirmBtn = await page.locator('input[title="確定"]');
          await confirmBtn.click();
          await page.waitForTimeout(1000);
        } else {
          // 予約できる状態なのでmessagesに追加
          messages.push(`${date} ${TIMES[j]}`);
          // 「確定」をクリックして元のページに戻る
          const backBtn = await page.locator('img[title="前へ戻る"]');
          await backBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }
    // 「次月」がある場合は次月へ遷移して再びチェック
    const nextMonthBtn = await page.locator('input[title="次月"]');
    const nextMonthBtnCount = await nextMonthBtn.count();
    if (nextMonthBtnCount > 0) {
      await nextMonthBtn.click();
      await page.waitForTimeout(1000);
      await checkAvailableDatetime();
    }
  }

  // 操作選択ページを表示
  const topPage = 'https://user.shinjuku-shisetsu-yoyaku.jp/regasu/reserve/gin_menu';
  await page.goto(topPage);
  await page.waitForTimeout(1000);

  // 「かんたん操作」をクリック
  await page.locator('input[title="かんたん操作"]').click();
  await page.waitForTimeout(1000);

  // 「利用者ページへ」をクリック
  await page.locator('input[title="利用者ページへ"]').click();
  await page.waitForTimeout(1000);

  // IDとPASSを入力して「確定」をクリック
  const id = process.env.USER_ID as string;
  const password = process.env.USER_PASSWORD as string;
  await page.locator('input[name="g_riyoushabangou"]').fill(id);
  await page.locator('input[name="ansyono"]').fill(password);
  await page.locator('input[title="確定"]').click();
  await page.waitForTimeout(1000);

  // 「予約申込」をクリック
  await page.locator('input[title="予約申込"]').click();
  await page.waitForTimeout(1000);

  // 「屋内スポーツ施設」 → 「四谷スポーツスクエア」 → 「四谷スポーツスクエア多目的ホール」 → 「バレーボール」 → 「確定」の順にクリック
  await page.locator('a[title="屋内スポーツ施設"]').click();
  await page.waitForTimeout(1000);
  await page.locator('a[title="四谷スポーツスクエア"]').click();
  await page.waitForTimeout(1000);
  await page.locator('a[title="四谷スポーツスクエア多目的ホール"]').click();
  await page.waitForTimeout(1000);
  await page.locator('a[title="バレーボール"]').click();
  await page.waitForTimeout(1000);
  await page.locator('input[title="確定"]').click();
  await page.waitForTimeout(1000);

  // 「表示する日付を増やす」をクリック
  await page.locator('img[title="施設別に切替"]').click();
  await page.waitForTimeout(1000);

  // 再起的に関数を呼び出して全ての月をチェックする
  await checkAvailableDatetime();
  await page.waitForTimeout(1000);

  if (messages.length) {
    let text = `<!channel>以下の日程で空きがあります📣\n${topPage}`;
    messages.forEach(message => {
      text += `\n・ ${message}`;
    });
    await postMessageToSlack(text);
  }
});
