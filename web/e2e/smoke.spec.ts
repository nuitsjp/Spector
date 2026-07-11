import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const enableAudio = async (page: Page): Promise<void> => {
  await page.goto('./');
  await page.getByRole('button', { name: '音声デバイスを有効化' }).click();
  await expect(page.getByRole('tab', { name: '計測' })).toBeVisible();
};

test('onboardingから4タブへ進み、キーボードで移動できる', async ({ page }) => {
  await page.goto('./');

  await expect(page).toHaveTitle('Spector');
  await expect(page.getByRole('heading', { name: 'Spector' })).toBeVisible();
  await expect(
    page.getByText('このボタンを押すまで、マイク権限は要求しません。'),
  ).toBeVisible();

  await page.getByRole('button', { name: '音声デバイスを有効化' }).click();
  const measureTab = page.getByRole('tab', { name: '計測' });
  await expect(measureTab).toHaveAttribute('aria-selected', 'true');
  await measureTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '解析' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '設定' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Home');
  await expect(measureTab).toHaveAttribute('aria-selected', 'true');

  for (const tabName of ['計測', '解析', 'スピーカー校正', '設定']) {
    await page.getByRole('tab', { name: tabName }).click();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  }
});

test('マイク権限拒否を日本語で案内する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException('テストで拒否しました。', 'NotAllowedError'),
        ),
    });
  });
  await page.goto('./');

  await page.getByRole('button', { name: '音声デバイスを有効化' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'マイクの利用が許可されませんでした。',
  );
});

test('fake音声を録音し、再読込後も解析・ZIP・削除を利用できる', async ({
  page,
}) => {
  await enableAudio(page);

  await page.getByLabel('試験音を再生する').uncheck();
  const duration = page.getByLabel('録音時間（秒）');
  await duration.fill('1');
  await duration.blur();
  await page.getByRole('button', { name: '録音を開始' }).click();
  await expect(
    page.getByRole('progressbar', { name: '録音進捗' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '録音を開始' })).toBeVisible({
    timeout: 10_000,
  });

  await page.reload();
  await page.getByRole('button', { name: '音声デバイスを有効化' }).click();
  await page.getByRole('tab', { name: '解析' }).click();
  await expect(page.getByText('完了', { exact: true }).first()).toBeVisible();

  const recordingDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '選択記録のZIPを保存' }).click();
  const recordingDownload = await recordingDownloadPromise;
  expect(recordingDownload.suggestedFilename()).toMatch(/^spector-.+\.zip$/);

  await page.getByRole('button', { name: '選択記録を削除' }).click();
  const dialog = page.getByRole('dialog', { name: '記録を削除しますか' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('比較できる記録がありません。')).toBeVisible();
});

test('Web版バックアップを保存し、不正な旧WPF ZIPを拒否する', async ({
  page,
}) => {
  await enableAudio(page);
  await page.getByRole('tab', { name: '設定' }).click();

  const backupDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを保存' }).click();
  const backupDownload = await backupDownloadPromise;
  expect(backupDownload.suggestedFilename()).toBe('spector-backup.zip');

  await page.getByLabel('旧WPF ZIPを読み込む').setInputFiles({
    name: 'invalid.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a zip'),
  });
  await expect(page.getByRole('alert')).toContainText('旧WPF ZIPが不正です。');
});

test('集約側と#remote端末側で手動offer/answerを交換する', async ({
  context,
}) => {
  const collector = await context.newPage();
  const terminal = await context.newPage();
  await enableAudio(collector);
  await collector.getByRole('tab', { name: '設定' }).click();
  await collector.getByRole('button', { name: '新しいofferを作成' }).click();
  const offerField = collector.getByLabel('端末側へ渡すoffer');
  await expect(offerField).not.toHaveValue('');
  const offer = await offerField.inputValue();

  await terminal.goto('./#remote');
  await terminal.getByRole('button', { name: '音声デバイスを有効化' }).click();
  await terminal.getByLabel('offer SDP').fill(offer);
  await terminal.getByRole('button', { name: 'answerを生成' }).click();
  const answerField = terminal.getByLabel('answer SDP');
  await expect(answerField).not.toHaveValue('');

  await collector
    .getByLabel('端末側で生成したanswer')
    .fill(await answerField.inputValue());
  await collector.getByRole('button', { name: 'answerを適用' }).click();

  await expect(terminal.getByText('送信中', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    collector.locator('.remote-card').getByText('接続中', { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});
