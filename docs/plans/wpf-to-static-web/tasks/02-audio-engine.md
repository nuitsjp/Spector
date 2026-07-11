---
mode: Write
model: opus
verify_commands:
  - npm --prefix web run typecheck
  - npm --prefix web run test:unit
  - npm --prefix web run build
depends_on: ["01"]
---

# ブラウザー音声エンジン

Web基盤と`src/domain`、`src/contracts`が存在する前提で、`web/src/audio`に最新Edge向け音声処理を実装する。

## 範囲

- ユーザー操作でAudioContextを初期化し、`getUserMedia`で個別マイクを開始・停止、`enumerateDevices`と`devicechange`で入力・出力を更新する。
- 明示的操作から`getDisplayMedia`を呼び、取得した音声trackをシステム音声ソースとして扱う。映像は表示・保存しないが共有セッション維持に必要なtrackは保持する。
- `AudioContext.setSinkId`で再生出力を選択し、`GainNode`で0..1のサイト内再生ゲインを制御する。未対応APIの代替実装は作らず、機能不足を型付きエラーで返す。
- AudioWorkletで各チャンネルの生Float32 PCMを処理し、ドメインDSPで25msごとのレベルを40Hz送信する。非有限値は0、下限-84dBFS。SharedArrayBufferは使わない。
- 生PCMを1秒単位でtransferable ArrayBufferとしてRecorder Workerへ渡し、PCM16 interleavedへ変換する。Workerは`RecordingChunkSink`へ1秒単位で書く。録音停止時に端数もflushする。
- 録音セッションは複数ソース、主入力、方向、Voiceメタデータ、試験音フラグ、再生ゲインを扱う。開始前に入力・出力・推定容量を検証する。
- 切断・track ended・容量エラー・コンテキスト停止では全セッションを停止し`incomplete`を返す。通常停止と時間満了は`complete`。進捗は`performance.now()`で計算する。
- 固定シードで決定的な試験ノイズをWeb Audio上に生成し、ローカルとremote制御の双方から開始・停止できるサービスを作る。既存WAVは参照しない。
- 可能なロジックはVitestで、実ブラウザーAPI境界はmock/fakeで検証する。PCM16は1LSB、44.1/48kHz、mono/stereo、端数flush、切断を含める。

## 変更境界

- 主に`web/src/audio/**`と対応テストだけを変更する。UI、IndexedDB具象、ZIP、WebRTC、CI、WPFは変更しない。
- `src/contracts`の不足は後方互換不要で最小限拡張してよいが、変更点を報告する。
- Chrome/Safari/Firefox向けfallback、MediaRecorder、SharedArrayBuffer、クラウド処理は使わない。

## 完了条件

- typecheck/unit/buildが成功する。
- UIが呼び出せる音声サービスと録音状態イベントがexportされる。
- WorkletとWorkerがVite production buildへ含まれる。

commitしてはならない。最後に、変更ファイル一覧、実行したコマンドと結果、確認できていない事項を報告すること。
