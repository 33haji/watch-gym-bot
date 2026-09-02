import { test, Page } from '@playwright/test';
import { SKIP_MARKER, SkipDates, dateAfterMonthsInJst, isSiteOpenInJst, isSkipDate, loadSkipDates, loopDeadline, postMessageToSlack, syncSkipDatesFromReactions, todayInJst } from '../utils';

/** 区分ごとの時間一覧 */
const TIMES_MAP = {
  10: '09:00~12:00',
  20: '12:20~15:20',
  30: '15:40~18:40',
  40: '19:00~22:00',
} as const;
/** 予約サイトのトップページ */
const TOP_PAGE = 'https://www.shinjuku.eprs.jp/regasu/web/index.jsp';
/** 空きを確認する間隔(秒) */
const CHECK_INTERVAL_SECONDS = Number(process.env.CHECK_INTERVAL_SECONDS || 60);
/** 空きの確認を繰り返す時間(分)。0の場合は1回だけ確認して終了する */
const LOOP_MINUTES = Number(process.env.LOOP_MINUTES || 0);

/** 空きが見つかった日付 */
type Availability = { date: string; label: string; times: string[] };
/** サイトの構造が変わっていないかを見るための集計 */
type ScanStats = { columns: number; statusCells: number };

/** すでに通知した異常(1回の起動につき1度だけ通知する) */
const notifiedAnomalies = new Set<string>();

// サイトの異常をSlackに通知する(同じ内容は1回の起動で1度だけ)
async function notifyAnomaly(key: string, message: string) {
  if (notifiedAnomalies.has(key)) return;
  notifiedAnomalies.add(key);
  await postMessageToSlack(message);
}

/** 対象の月の中で空きがあるかチェックする関数 */
async function checkAvailableDatetime(page: Page, skipDates: SkipDates, availabilities: Availability[], stats: ScanStats): Promise<boolean> {
  const tableTheads = await page.locator('#week-info thead th[scope="col"]');
  const tableTheadsLength = await tableTheads.count();
  stats.columns += tableTheadsLength;
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
      await notifyAnomaly('date', `日付の取得に失敗しました(i=${i})⚠️ サイトの構造が変わった可能性があります。`);
      return false;
    }
    // 日付の年はサイトに表示されないため、日本時間の今日を基準に推定する
    const today = todayInJst();
    const month = monthText.replace('月', '').padStart(2, '0');
    const day = dayText.replace('日', '').padStart(2, '0');
    const year = Number(today.slice(4, 6)) <= parseInt(month, 10) ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) + 1;
    const date = `${year}${month}${day}`;
    // 2ヶ月以上先に突入したらreturn
    // (skip判定より先に行わないと、skipする日付が続いた場合に終了できず再帰が止まらなくなる)
    if (date > dateAfterMonthsInJst(2)) return true;
    // スキップする日付の場合はreturn
    if (isSkipDate(date, skipDates)) continue;
    // 空きを探す(平日は4区分目のみ、休日は1~4区分目全て)
    for (let j = isHoliday ? 10 : 40; j <= 40; j += 10) {
      // 存在確認をしてから属性を読む(セルが無い場合にactionTimeoutまで待たされるのを避ける)
      const cell = page.locator(`[id="${date}_${j}"] img`);
      if (!await cell.count()) continue;
      // 取得できた場合だけ数える(全く取得できない場合はサイトの構造が変わった可能性がある)
      stats.statusCells++;
      const alt = await cell.getAttribute('alt');
      if (alt !== '空き') continue;
      // 空きがあった場合はavailabilitiesに日付単位で追加
      const time = TIMES_MAP[j as keyof typeof TIMES_MAP];
      const availability = availabilities.find(item => item.date === date);
      if (availability) {
        availability.times.push(time);
      } else {
        availabilities.push({ date, label: `${monthText}${dayText}`, times: [time] });
      }
    }
  }
  // 次の週へ遷移して再びチェック
  const nextWeek = page.locator('#next-week');
  if (!await nextWeek.count()) {
    await notifyAnomaly('next-week', '「翌週」ボタンが見つかりませんでした⚠️ サイトの構造が変わった可能性があります。');
    return false;
  }
  await nextWeek.click();
  await page.waitForTimeout(1000);
  return await checkAvailableDatetime(page, skipDates, availabilities, stats);
}

// 空きを1回チェックして、まだ通知していない空きがあれば通知する
async function checkAndNotify(page: Page, notified: Set<string>) {
  // 通知に付いたリアクションを読み取ってskipする日付に反映する
  const addedSkipDates = await syncSkipDatesFromReactions();
  /** skipする日付(skip-dates.jsonで管理。リアクションからも追加される) */
  const skipDates = loadSkipDates();
  if (addedSkipDates.length) {
    const labels = addedSkipDates.map(date => `${Number(date.slice(4, 6))}月${Number(date.slice(6, 8))}日`);
    await postMessageToSlack(`${labels.join('、')} をスキップ対象にしました✅ 以降この日付の空きは通知しません。`);
  }

  // 検索条件を指定して検索
  await page.locator('#bname').selectOption({ value: '1000_1030' }); // 四谷スポーツスクエア
  await page.locator('#purpose').selectOption({ value: '24_210' }); // バレーボール
  await page.locator('#btn-go').click();
  await page.waitForTimeout(1000);

  // 再起的に関数を呼び出して全ての日付をチェックする
  const availabilities: Availability[] = [];
  const stats: ScanStats = { columns: 0, statusCells: 0 };
  const result = await checkAvailableDatetime(page, skipDates, availabilities, stats);
  if (!result) return;
  await page.waitForTimeout(1000);

  // 「空きなし」とサイトの構造変更を区別できるよう、何も取得できていない場合は通知する
  if (!stats.columns) {
    await notifyAnomaly('columns', '週表示の日付を1つも取得できませんでした⚠️ サイトの構造が変わった可能性があります。');
    return;
  }
  if (!stats.statusCells) {
    await notifyAnomaly('cells', '空き状況のセルを1つも取得できませんでした⚠️ サイトの構造が変わった可能性があります。');
    return;
  }

  // 日付ごとにリアクションを付けられるよう、1日付につき1メッセージを送る
  let isFirstMessage = true;
  for (const { date, label, times } of availabilities) {
    // この実行ですでに通知した枠は繰り返し通知しない
    const newTimes = times.filter(time => !notified.has(`${date}_${time}`));
    if (!newTimes.length) continue;
    newTimes.forEach(time => notified.add(`${date}_${time}`));
    // メンションは1回の通知につき1度だけにする
    const mention = isFirstMessage ? '<!channel>' : '';
    isFirstMessage = false;
    let text = `${mention}${label} に空きがあります📣\n${TOP_PAGE}`;
    newTimes.forEach(time => {
      text += `\n・ ${time}`;
    });
    // 末尾のマーカーを目印に、リアクションが付いた日付を次回実行時に読み取る
    text += `\nこの日付を予約しない場合は 🙅 を付けてください ${SKIP_MARKER(date)}`;
    await postMessageToSlack(text);
  }
}

// トップページからログインする
async function login(page: Page) {
  await page.goto(TOP_PAGE);
  await page.waitForTimeout(1000);
  await page.locator('#btn-login').click();
  await page.waitForTimeout(1000);
  const id = process.env.USER_ID as string;
  const password = process.env.USER_PASSWORD as string;
  await page.locator('#userId').fill(id);
  await page.locator('#password').fill(password);
  await page.locator('#btn-go').click();
  await page.waitForTimeout(1000);
}

test('空きがあるかどうかチェック', async ({ page }) => {
  const startedAt = Date.now();
  // cronの起動は大きく遅延するため、利用時間外まで押し出された場合は何もせず終了する
  // (手動実行は動作確認のためスキップしない)
  const isScheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
  test.skip(isScheduled && !isSiteOpenInJst(startedAt), 'サイトの利用時間外のため実行しません');

  /** 空きの確認を打ち切る時刻(起動からLOOP_MINUTES後、または日本時間の利用終了時刻の早い方) */
  const deadline = loopDeadline(startedAt, LOOP_MINUTES);
  // ループする場合はその分テスト全体のtimeoutを延ばす
  test.setTimeout(deadline - startedAt + 5 * 60 * 1000);

  await login(page);

  // GitHubのcronは指定どおりに起動しないため、1回の起動の中で繰り返し確認する
  // (ログインは使い回すので、1回あたりのアクセスは初回より軽い)
  /** この実行ですでに通知した枠 */
  const notified = new Set<string>();
  for (let round = 0; ; round++) {
    try {
      await checkAndNotify(page, notified);
    } catch (error) {
      // 1周目で失敗した場合はそのまま失敗させ、Playwrightのリトライに任せる
      if (round === 0) throw error;
      // 2周目以降の一時的な失敗でジョブ全体を落とすと、残りの時間を監視できなくなるため続行する
      await notifyAnomaly('check', `空きの確認中にエラーが発生しました⚠️\n${(error as Error).message}`);
      await login(page).catch(() => { /* 次の周回で再試行する */ });
    }
    if (Date.now() + CHECK_INTERVAL_SECONDS * 1000 >= deadline) break;
    await page.waitForTimeout(CHECK_INTERVAL_SECONDS * 1000);
    // ホームに戻ってから次の検索を行う(戻れない場合はログインからやり直す)
    await page.locator('#nav-home').click().catch(() => login(page));
    await page.waitForTimeout(1500);
  }
});
