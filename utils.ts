import fs from 'fs';
import path from 'path';
import { WebClient } from '@slack/web-api';

const removeAnsi = (error) => {
  return error.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''); // eslint-disable-line no-control-regex
};

/** skipする日付の定義ファイル */
export const SKIP_DATES_PATH = path.resolve(__dirname, 'skip-dates.json');

/** 通知メッセージに埋め込むskip登録用のマーカー(この日付にリアクションが付いたらskipする) */
export const SKIP_MARKER = (date: string) => `(skip:${date})`;
/** skip登録として扱うリアクション(🙅系はどれでもよい。❌🚫も許容する) */
const SKIP_REACTION_NAMES = [
  'ng-man', 'ng-woman', // 🙅系の別名
  'x', 'heavy-multiplication-x', 'no-entry', 'no-entry-sign'
];

/** リアクションを読み取る対象期間(日) */
const REACTION_LOOKBACK_DAYS = 14;

// skip登録として扱うリアクションかどうか(🙅‍♂️🙅‍♀️や肌色違いも同じ扱いにする)
export function isSkipReaction(name: string): boolean {
  // スキントーン等の修飾を除き、区切り文字の違い(_と-)を吸収する
  const normalized = name.split('::')[0].replace(/_/g, '-');
  // no_good / man-gesturing-no / woman-gesturing-no / person-gesturing-no など🙅系を全て拾う
  if (/(^|-)no-good$/.test(normalized) || /gesturing-no$/.test(normalized)) return true;
  return SKIP_REACTION_NAMES.includes(normalized);
}

export type SkipDates = {
  /** 毎年skipする日付(MMDD) */
  yearly: string[];
  /** その年だけskipする日付(YYYYMMDD)。Slackのリアクションから追加される */
  oneTime: string[];
};

// DateをYYYYMMDD形式にする(UTCとして解釈する)
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 日本時間の今日の日付(YYYYMMDD)を返す
export function todayInJst(): string {
  return formatDate(new Date(Date.now() + 9 * 60 * 60 * 1000));
}

// 日本時間の今日からnヶ月後の日付(YYYYMMDD)を返す
export function dateAfterMonthsInJst(months: number): string {
  const today = todayInJst();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(4, 6));
  const day = Number(today.slice(6, 8));
  return formatDate(new Date(Date.UTC(year, month - 1 + months, day)));
}

// skipする日付の定義を読み込む
export function loadSkipDates(): SkipDates {
  if (!fs.existsSync(SKIP_DATES_PATH)) return { yearly: [], oneTime: [] };

  const parsed = JSON.parse(fs.readFileSync(SKIP_DATES_PATH, 'utf-8'));
  return {
    yearly: Array.isArray(parsed.yearly) ? parsed.yearly : [],
    oneTime: Array.isArray(parsed.oneTime) ? parsed.oneTime : []
  };
}

// skipする日付の定義を保存する(過去になったoneTimeの日付は削除する)
export function saveSkipDates(skipDates: SkipDates) {
  const today = todayInJst();
  const oneTime = [...new Set(skipDates.oneTime.filter(date => date >= today))].sort();
  fs.writeFileSync(SKIP_DATES_PATH, `${JSON.stringify({ yearly: skipDates.yearly, oneTime }, null, 2)}\n`);
}

// 対象の日付(YYYYMMDD)がskip対象かどうか
export function isSkipDate(date: string, skipDates: SkipDates): boolean {
  return skipDates.oneTime.includes(date) || skipDates.yearly.includes(date.slice(4));
}

// メッセージ一覧から、skipリアクションが付いていて未登録の日付を取り出す
export function extractSkipDates(
  messages: { text?: string; reactions?: { name?: string }[] }[],
  skipDates: SkipDates
): string[] {
  const dates: string[] = [];
  messages.forEach(message => {
    // メッセージに埋め込んだマーカーから対象の日付を取り出す
    const date = (message.text || '').match(/\(skip:(\d{8})\)/)?.[1];
    if (!date) return;
    const reactions = (message.reactions || []).map(reaction => reaction.name || '');
    if (!reactions.some(isSkipReaction)) {
      // 想定外の絵文字が使われていた場合に気付けるようログに残す
      if (reactions.length) console.log(`skip対象外のリアクションです(date=${date}): ${reactions.join(', ')}`);
      return;
    }
    // 過去の日付・登録済みの日付は無視する
    if (date < todayInJst() || isSkipDate(date, skipDates) || dates.includes(date)) return;
    dates.push(date);
  });
  return dates;
}

// 通知メッセージに付いたリアクションを読み取り、skipする日付に反映する(追加された日付を返す)
export async function syncSkipDatesFromReactions(): Promise<string[]> {
  if (!process.env.PRODUCTION || !process.env.SLACK_CHANNEL) return [];

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const oldest = String(Math.floor(Date.now() / 1000) - REACTION_LOOKBACK_DAYS * 24 * 60 * 60);
  const history = await client.conversations.history({
    channel: process.env.SLACK_CHANNEL,
    oldest,
    limit: 200
  });

  const skipDates = loadSkipDates();
  const added = extractSkipDates(history.messages || [], skipDates);
  skipDates.oneTime.push(...added);
  // 追加がない場合も、過去になった日付を削除するために保存する
  saveSkipDates(skipDates);
  return added;
}

// Slackでメッセージを送る
export async function postMessageToSlack(text: string) {
  if (!process.env.PRODUCTION || !process.env.SLACK_CHANNEL || !text) {
    console.log(removeAnsi(text));
    return;
  }

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  await client.chat.postMessage({
    channel: process.env.SLACK_CHANNEL,
    text: removeAnsi(text)
  });
}

// Slackで画像ファイルを送る
export async function uploadImageToSlack(fileInfo: {
  name: string;
  contentType: string;
  path?: string | undefined;
  body?: Buffer | undefined;
} | undefined) {
  if (!process.env.PRODUCTION || !process.env.SLACK_CHANNEL || !fileInfo || !fileInfo.path) return;

  if (!fs.existsSync(fileInfo.path)) {
    await postMessageToSlack('スナップショットのファイルが存在しません⚠️');
    return;
  }

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  await client.files.uploadV2({
    channels: process.env.SLACK_CHANNEL,
    file: fs.createReadStream(path.resolve(fileInfo.path)),
    filename: fileInfo.name,
    filetype: fileInfo.contentType,
    title: ''
  });
}
