import { expect, test } from '@playwright/test';
import { SKIP_MARKER, SkipDates, dateAfterMonthsInJst, extractSkipDates, isSiteOpenInJst, isSkipDate, isSkipReaction, loadSkipDates, loopDeadline, todayInJst } from '../utils';

/** テスト用の未来の日付(過去日として除外されないよう常に1ヶ月後を使う) */
const FUTURE_DATE = dateAfterMonthsInJst(1);
const skipDates: SkipDates = { yearly: ['0816'], oneTime: ['20260913'] };

test.describe('isSkipReaction', () => {
  test('🙅系はスキントーン・性別・別名の違いを問わずskip扱いにする', () => {
    const names = [
      'no_good', 'no_good::skin-tone-2', 'man-gesturing-no', 'woman-gesturing-no',
      'woman-gesturing-no::skin-tone-5', 'person-gesturing-no', 'ng_man', 'ng_woman'
    ];
    names.forEach(name => expect(isSkipReaction(name), name).toBe(true));
  });

  test('❌ / ✖️ / 🚫 もskip扱いにする', () => {
    ['x', 'heavy_multiplication_x', 'no_entry', 'no_entry_sign'].forEach(name => {
      expect(isSkipReaction(name), name).toBe(true);
    });
  });

  test('関係のないリアクションはskip扱いにしない', () => {
    ['thumbsup', '+1', 'eyes', 'tada', 'white_check_mark', 'no_mouth', 'x_men', 'ng'].forEach(name => {
      expect(isSkipReaction(name), name).toBe(false);
    });
  });
});

test.describe('isSkipDate', () => {
  test('yearlyはMMDDが一致すれば年に関係なくskipする', () => {
    expect(isSkipDate('20260816', skipDates)).toBe(true);
    expect(isSkipDate('20270816', skipDates)).toBe(true);
  });

  test('oneTimeは年まで一致した場合だけskipする', () => {
    expect(isSkipDate('20260913', skipDates)).toBe(true);
    expect(isSkipDate('20270913', skipDates)).toBe(false);
  });

  test('登録のない日付はskipしない', () => {
    expect(isSkipDate('20260901', skipDates)).toBe(false);
  });
});

test.describe('extractSkipDates', () => {
  const message = (date: string, reactions: string[]) => ({
    text: `9月13日 に空きがあります\n${SKIP_MARKER(date)}`,
    reactions: reactions.map(name => ({ name }))
  });

  test('skipリアクションが付いた未登録の日付だけを取り出す', () => {
    const dates = extractSkipDates([message(FUTURE_DATE, ['no_good'])], skipDates);
    expect(dates).toEqual([FUTURE_DATE]);
  });

  test('skip対象外のリアクション・リアクションなしは無視する', () => {
    expect(extractSkipDates([message(FUTURE_DATE, ['thumbsup'])], skipDates)).toEqual([]);
    expect(extractSkipDates([message(FUTURE_DATE, [])], skipDates)).toEqual([]);
  });

  test('マーカーのないメッセージは無視する', () => {
    const withoutMarker = { text: 'ただのメッセージ', reactions: [{ name: 'no_good' }] };
    expect(extractSkipDates([withoutMarker], skipDates)).toEqual([]);
  });

  test('過去の日付・登録済みの日付・重複は除外する', () => {
    const messages = [
      message('20200101', ['no_good']), // 過去
      message('20260913', ['no_good']), // 登録済み
      message(FUTURE_DATE, ['no_good']),
      message(FUTURE_DATE, ['x']) // 重複
    ];
    expect(extractSkipDates(messages, skipDates)).toEqual([FUTURE_DATE]);
  });
});

test.describe('日付の計算', () => {
  test('todayInJstはYYYYMMDD形式を返す', () => {
    expect(todayInJst()).toMatch(/^\d{8}$/);
  });

  test('dateAfterMonthsInJstは0ヶ月後なら今日と一致する', () => {
    expect(dateAfterMonthsInJst(0)).toBe(todayInJst());
  });

  test('dateAfterMonthsInJstは未来の日付を返す', () => {
    expect(Number(dateAfterMonthsInJst(2))).toBeGreaterThan(Number(todayInJst()));
  });
});

test.describe('サイトの利用時間', () => {
  /** 日本時間のYYYY/MM/DD HH:MMに対応するタイムスタンプ */
  const jst = (year: number, month: number, day: number, hour: number, minute = 0) => {
    return Date.UTC(year, month - 1, day, hour - 9, minute);
  };
  const MINUTE = 60 * 1000;

  test('isSiteOpenInJstは9:00~翌2:00の間だけtrueを返す', () => {
    expect(isSiteOpenInJst(jst(2026, 8, 24, 8, 59))).toBe(false);
    expect(isSiteOpenInJst(jst(2026, 8, 24, 9, 0))).toBe(true);
    expect(isSiteOpenInJst(jst(2026, 8, 24, 23, 30))).toBe(true);
    expect(isSiteOpenInJst(jst(2026, 8, 25, 1, 59))).toBe(true);
    expect(isSiteOpenInJst(jst(2026, 8, 25, 2, 0))).toBe(false);
    // 今回3時台の通知が発生した時間帯
    expect(isSiteOpenInJst(jst(2026, 8, 25, 3, 2))).toBe(false);
  });

  test('利用終了まで余裕がある場合は起動からLOOP_MINUTES後を返す', () => {
    const now = jst(2026, 8, 24, 10, 0);
    expect(loopDeadline(now, 50)).toBe(now + 50 * MINUTE);
  });

  test('利用終了をまたぐ場合は日本時間の2:00で打ち切る', () => {
    const now = jst(2026, 8, 25, 1, 30);
    expect(loopDeadline(now, 50)).toBe(jst(2026, 8, 25, 2, 0));
  });

  test('日付をまたぐ場合も翌日の2:00で打ち切る', () => {
    const now = jst(2026, 8, 24, 23, 50);
    expect(loopDeadline(now, 50)).toBe(jst(2026, 8, 25, 0, 40));
    expect(loopDeadline(now, 300)).toBe(jst(2026, 8, 25, 2, 0));
  });

  test('利用時間外に起動された場合はループしない', () => {
    // cronの遅延と待機で起動が2:41までずれ込んだケース
    const now = jst(2026, 8, 25, 2, 41);
    expect(loopDeadline(now, 50)).toBe(now);
  });
});

test.describe('loadSkipDates', () => {
  test('skip-dates.jsonをyearly/oneTimeの配列として読み込める', () => {
    const loaded = loadSkipDates();
    expect(Array.isArray(loaded.yearly)).toBe(true);
    expect(Array.isArray(loaded.oneTime)).toBe(true);
  });
});
