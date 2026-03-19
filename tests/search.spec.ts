import { test } from '@playwright/test';
import { postMessageToSlack } from '../utils';

/** skipする日付 */
const SKIP_DATES = ['0420'];
/** 区分ごとの時間一覧 */
const TIMES_MAP = {
  10: '09:00~12:00',
  20: '12:20~15:20',
  30: '15:40~18:40',
  40: '19:00~22:00',
} as const;

test('空きがあるかどうかチェック', async ({ page }) => {
  // トップページにアクセスしてログインページへ
  const topPage = 'https://www.shinjuku.eprs.jp/regasu/web/index.jsp';
  await page.goto(topPage);
  await page.waitForTimeout(1000);
  await page.locator('#btn-login').click();
  await page.waitForTimeout(1000);

  // ログイン
  const id = process.env.USER_ID as string;
  const password = process.env.USER_PASSWORD as string;
  await page.locator('#userId').fill(id);
  await page.locator('#password').fill(password);
  await page.locator('#btn-go').click();
  await page.waitForTimeout(1000);

  // 検索条件を指定して検索
  await page.locator('#bname').selectOption({ value: '1000_1030' }); // 四谷スポーツスクエア
  await page.locator('#purpose').selectOption({ value: '24_210' }); // バレーボール
  await page.locator('#btn-go').click();
  await page.waitForTimeout(1000);

  // 再起的に関数を呼び出して全ての日付をチェックする
  const messages: string[] = [];
  /** 対象の月の中で空きがあるかチェックする関数 */
  async function checkAvailableDatetime() {
    const tableTheads = await page.locator('#week-info thead th[scope="col"]');
    const tableTheadsLength = await tableTheads.count();
    for (let i = 0; i < tableTheadsLength; i++) {
      const targetTh = tableTheads.nth(i);
      // 休日/祝日の判定
      const isHoliday = ['holiday', 'saturday'].includes(await targetTh.getAttribute('class') || '');
      // 日付を取得
      const html = await targetTh.innerHTML();
      const spanTexts = html.match(/<span[^>]*>(.*?)<\/span>/g)?.map(span => span.replace(/<[^>]+>/g, '').trim());
      const monthText = spanTexts?.find(text => text.includes('月'));
      const dayText = spanTexts?.find(text => text.includes('日'));
      if (!monthText || !dayText) {
        await postMessageToSlack(`日付の取得に失敗しました(i=${i})`);
        return false;
      }
      const currentDate = new Date();
      const month = monthText.replace('月', '').padStart(2, '0');
      const day = dayText.replace('日', '').padStart(2, '0');
      const year = currentDate.getMonth() + 1 <= parseInt(month, 10) ? currentDate.getFullYear() : currentDate.getFullYear() + 1;
      const date = `${year}${month}${day}`;
      // スキップする日付の場合はreturn
      if (SKIP_DATES.includes(`${month}${day}`)) continue;
      // 2ヶ月以上先に突入したらreturn
      const targetDate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
      const twoMonthsLater = new Date();
      twoMonthsLater.setMonth(currentDate.getMonth() + 2);
      if (targetDate > twoMonthsLater) return true;
      // 空きを探す(平日は4区分目のみ、休日は1~4区分目全て)
      for (let j = isHoliday ? 10 : 40; j <= 40; j += 10) {
        const alt = await page.locator(`#\\00003${date}_${j} img`).getAttribute('alt');
        if (alt !== '空き') continue;
        // 空きがあった場合はmessagesに追加
        messages.push(`${monthText}${dayText} ${TIMES_MAP[j]}`);
      }
    }
    // 次の週へ遷移して再びチェック
    await page.locator('#next-week').click();
    await page.waitForTimeout(1000);
    return await checkAvailableDatetime();
  }
  const result = await checkAvailableDatetime();
  if (!result) return;
  await page.waitForTimeout(1000);

  if (messages.length) {
    let text = `<!channel>以下の日程で空きがあります📣\n${topPage}`;
    messages.forEach(message => {
      text += `\n・ ${message}`;
    });
    await postMessageToSlack(text);
  }
});
