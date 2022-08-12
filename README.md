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

### prod
```
$ npm run test:e2e
```
