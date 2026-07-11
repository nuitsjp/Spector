---
mode: Write
model: sonnet
depends_on: [06]
---

# 初回マイク権限取得の修正

## 背景

公開サイトを実Edgeで確認したところ、マイク権限が`prompt`の状態では`enumerateDevices()`が`audioinput`を1件返すものの、`deviceId`と`label`は空だった。現実装はこの空IDを`deviceId: { exact: '' }`として`getUserMedia()`へ渡すため、`OverconstrainedError`となり「選択したマイクを利用できません」と表示される。権限取得後は`default`、`communications`、実IDが列挙され、既定マイクを開始できることを実機確認済み。

## 実装要件

- `BrowserAudioEngine.initialize()`のユーザー操作内で、音声デバイスを選択する前に`getUserMedia({ audio: true, video: false })`を1回実行してマイク権限を取得する。
- 権限取得用ストリームは取得直後に全トラックを停止し、録音・保存しない。
- 権限取得後に`refreshDevices()`を実行し、空IDではなく権限付与後のデバイス一覧を公開する。
- 権限拒否、マイクなし、その他の取得失敗は既存の`toAudioCaptureError()`で日本語の`AudioEngineError`へ変換する。
- 初期化失敗時はAudioContext、イベント購読、GainNodeなどを従来どおり確実に破棄する。
- メイン画面と`#remote`端末側の両方は`initialize()`を利用しているため、UI側へ重複した権限取得処理を追加しない。

## テスト要件

- 権限取得前は空ID、権限取得後は有効なIDを返す`MediaDevices`フィクスチャを追加し、初期化後に有効なデバイスが列挙され、`exact`指定で開始できることを確認する。
- 権限取得用ストリームのトラックが停止されることを確認する。
- `NotAllowedError`が`permission-denied`へ変換され、初期化リソースが破棄されることを確認する。
- 既存のBrowserAudioEngineテストを更新し、回帰を起こさない。

## 検証

```powershell
npm --prefix web run format:check
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test:unit -- browserAudioEngine.test.ts
```

commitしてはならない。変更ファイル一覧、実行コマンドと結果、確認できていない事項を最後に報告すること。
