---
mode: Write
model: sonnet
verify_commands:
  - npm --prefix web install
  - npm --prefix web run typecheck
  - npm --prefix web run test:unit
  - npm --prefix web run build
depends_on: []
---

# Web基盤・ドメイン・DSP

`D:\nuitsjp\Spector`に静的Web版の基盤と副作用のないドメインロジックを実装する。

## 範囲

- `web/`へNode.js 24、npm、React 19、TypeScript、Vite 8のSPAを作る。Vite `base`は`/Spector/`。現時点のAppは後続UIが置換できる最小プレースホルダーでよい。
- 厳格なTypeScript、ESLint、Prettier、Vitest、Playwrightの設定と、`format:check`、`lint`、`typecheck`、`test:unit`、`test:e2e`、`build`スクリプトを定義する。
- 依存にはReact、Chart.js、`idb`、`wavefile`、`fflate`を含める。テスト依存にはVitest、Testing Library、fake-indexeddb、Playwright、axeを含める。
- `src/domain`に以下を定義する。
  - `SignalLevelDbfs`（-84..0）、`CalibrationLevelDb`、`PlaybackGain`（0..1）を作る境界検証関数。
  - 8方位、`complete | incomplete`、設定、端末設定、校正点。
  - schemaVersion 1の`RecordingRecord`、端末別録音、統計。閾値名は`aboveMinus30Ratio`等とする。
  - WebRTC制御メッセージとPCMヘッダーに共有される型。
- `src/domain/dsp`に現行`AWeightingFilter.cs`、`WaveFileAnalyzer.cs`、`AudioCalibrator.cs`と等価な実装を作る。A特性は同じ5段BiQuad、25ms窓、40Hz、RMS、`20*log10`、非有限値0、-84dBFS下限。統計はmin/avg/maxと`>-30/-40/-50`比率。
- 現行C#に基づく無音、1kHz正弦波、閾値境界、44.1/48kHz、校正点の固定fixtureとテストを追加する。DSP許容誤差0.01dB、スプライン1e-9。
- `src/contracts`に後続モジュール間のインターフェースを定義する。最低限、音声ソース、レベルイベント、録音チャンクsink、保存リポジトリ、remote peerを分離する。

## 制約

- UIは日本語、対象はWindows 11最新Edge、ルーターなし、バックエンドなし。
- WPFファイル、ルート`Settings.json`、`Record/`、`.gitignore`、README、CIは変更しない。
- Fast time weighting、クラウド、認証、互換ブラウザー分岐を追加しない。
- 既存C#の明白な未使用・不具合挙動を新仕様として増幅しない。

## 完了条件

- `npm --prefix web install`でlockfileが生成される。
- format/lint/typecheck/unit/buildが成功する。
- 公開型とDSPが後続タスクからimportできる。

commitしてはならない。最後に、変更ファイル一覧、実行したコマンドと結果、確認できていない事項を報告すること。
