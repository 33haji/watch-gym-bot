import { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { postMessageToSlack, uploadImageToSlack } from './utils';

class MyReporter implements Reporter {
  private errorMessage = '';
  private errorSnapshotInfo: {
    name: string;
    contentType: string;
    path?: string | undefined;
    body?: Buffer | undefined;
} | undefined;

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.error?.message && result.retry === test.retries) {
      this.errorMessage = `エラーが発生しました⚠️\nエラーメッセージ："${result.error.message}"`;
      this.errorSnapshotInfo = result.attachments[0];
    }
  }

  async onEnd(result: FullResult) {
    if (this.errorMessage) {
      // エラーメッセージをSlackに送信
      await postMessageToSlack(this.errorMessage);
      // エラー時のスナップショットをSlackに送信
      await uploadImageToSlack(this.errorSnapshotInfo);
    }
  }
}
export default MyReporter;
