# watch-gym-bot
体育館の予約サイトを訪問し、空きがあったらSlack通知するbot

## How to use
### Setup
1. `$ npm ci`でnode_modulesをインストール
2. .env.sample をコピーして .env を作成し、内容を埋める

### dev
```
$ npm run test
```
※ リトライなし
※ エラー時のSlack送信なし

```
$ npm run dev
```
※ UIの挙動を見ながら確認するモード

```
$ npm run test:unit
```
※ `utils.ts` の判定ロジックのみのテスト（ブラウザもサイトへのアクセスも不要）

### prod
```
$ npm run test:e2e
```

## skipする日付
通知対象から除外する日付は `skip-dates.json` で管理する。

| キー | 形式 | 用途 |
| --- | --- | --- |
| `yearly` | `MMDD` | 毎年skipしたい日付。手動で編集する |
| `oneTime` | `YYYYMMDD` | その年だけskipする日付。Slackのリアクションから追加される（過去になった日付は自動で削除される） |

### リアクションでskip登録
空き通知は日付ごとに1メッセージ送られる。予約しない日付のメッセージに 🙅 を付けると、以降その日付は通知されなくなる。

1. 通知メッセージに 🙅 を付ける
2. 次のcron実行時（最大5分後）にbotがリアクションを読み取り、`skip-dates.json` の `oneTime` に日付を追加してcommitする
3. 登録できたらSlackに「◯月◯日 をスキップ対象にしました✅」と通知される

※ skip登録として扱うリアクションは 🙅系（🙅‍♂️🙅‍♀️や肌色違いも可）と ❌ / ✖️ / 🚫（判定は `utils.ts` の `isSkipReaction`）
※ 対象外のリアクションが付いていた場合はワークフローのログに絵文字名が出力される
※ 読み取り対象は直近14日間のメッセージ
※ 反映は次のcron実行時なので、リアクション後に最大1回だけ同じ日付の通知が届くことがある

### Slack Appに必要な権限
- `chat:write` … 通知の送信
- `files:write` … エラー時のスクショ送信
- `channels:history`（プライベートチャンネルの場合は `groups:history`）… リアクションの読み取り
