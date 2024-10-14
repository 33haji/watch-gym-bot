import fs from 'fs';
import path from 'path';
import { WebClient } from '@slack/web-api';

const removeAnsi = (error) => {
  return error.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''); // eslint-disable-line no-control-regex
};

// Slackでメッセージを送る
export async function postMessageToSlack(text: string) {
  // TODO: 後で消す
  console.log(`-----------PRODUCTION: ${process.env.PRODUCTION}, SLACK_CHANNEL: ${process.env.SLACK_CHANNEL}, text: ${text}--------------`);
  if (!process.env.PRODUCTION || !process.env.SLACK_CHANNEL || !text) return;

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
