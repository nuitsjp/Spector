# WPF to Static Web

## 目的とゴール

- `web/` に React 19 / TypeScript / Vite 8 の静的SPAを実装し、`https://nuitsjp.github.io/Spector/` で配信できる成果物を作る。
- Windows 11の最新Microsoft Edgeで、ローカル音声入力、明示的なシステム音声入力、録音、A特性解析、校正、履歴、ZIP入出力、同一LAN内の手動WebRTC端末連携を利用可能にする。
- 旧`Settings.json`と`Record/**/record.json + WAV`をZIPから一括移行できるようにする。
- 自動テスト、GitHub Actions、Pages配備を整備し、最終的にWPFソリューションとWindows専用依存を削除する。

## 背景と設計判断

- 採用: React/TypeScript/Vite。ブラウザーAPIを直接扱い、約4,400行の現行実装を小さなクライアントアプリへ移す。Blazor WASMは音声・WebRTC・IndexedDBでJavaScript連携が中心となり、WPF/NAudioコードの再利用が限定的なため不採用。
- 採用: バックエンドなしのGitHub Pages。WASAPIは`getUserMedia`と明示的な`getDisplayMedia`、OS音量は`GainNode`、TCP 5432は手動offer/answer交換によるWebRTCへ置換する。ネイティブ補助アプリと外部シグナリング/TURNは静的完結条件に反するため不採用。
- 採用: 最新Edge限定。`AudioContext.setSinkId`とシステム音声共有のブラウザー差を吸収する互換実装は作らない。Chrome/Safari/Firefox/モバイルは対象外。
- 採用: 既存のA特性フィルター、25ms窓、40Hz、-84dBFS下限、統計、自然3次スプラインをTypeScriptへ移植する。未使用のFast time weighting、A特性無効化、任意保存先、12件の未表示録音プロセスは追加しない。
- 採用: IndexedDBに設定・メタデータ・WAV Blobを保存し、ZIPでバックアップする。クラウド同期・認証は追加しない。
- 採用: 権利根拠のない音声資産は配布せず、固定シードの決定的な試験ノイズを生成する。`With Voice`はメタデータ、`With Buzz`は試験音再生として扱う。
- 採用: UIは日本語、4タブ、1024px以上のデスクトップ向け。ルーターを導入せず、端末側は`#remote`で切り替える。

## 影響範囲

- 追加: `web/`配下のSPA、ドメイン/DSP、音声Worklet/Worker、IndexedDB、ZIP移行、WebRTC、UI、テスト。
- 追加: `.github/workflows/`の検証・Pages配備、ルートREADME、実行記録である本計画パッケージ。
- 更新: `.gitignore`へ`Settings.json`、`Record/`、Node/Vite/Playwright生成物を追加する。
- 削除: 全タスクの統合検証後に`Spector/`のWPFソリューション、XAML、Windows専用コード、バックアップcsproj、未確認WAVを削除する。
- 変更しない: `LICENSE`、ユーザーの未追跡`Settings.json`と`Record/`実データ、Git履歴、リモートリポジトリ。commit/push/Pages設定変更は行わない。

## タスク分割表

| ID | タスク | Mode | モデル | 依存 | 完了条件 |
|---|---|---|---|---|---|
| 01 | `tasks/01-foundation-domain.md` | Write | sonnet | なし | Web基盤、型、DSP、ゴールデンテストが通る |
| 02 | `tasks/02-audio-engine.md` | Write | opus | 01 | Worklet/Worker、端末取得、録音、試験音が実装・テスト済み |
| 03 | `tasks/03-storage-migration.md` | Write | sonnet | 01 | IndexedDB、WAV/ZIP、旧データ移行、重複防止がテスト済み |
| 04 | `tasks/04-webrtc.md` | Write | opus | 01 | 手動SDPと2チャネルプロトコルがテスト済み |
| 05 | `tasks/05-ui-integration.md` | Write | opus | 02,03,04 | 4タブとremoteモードが統合され、E2E・描画確認済み |
| 06 | `tasks/06-release-cleanup.md` | Write | sonnet | 05 | CI/Pages設定、ignore、WPF除去、production buildが完了 |

## 全体検証

```powershell
npm --prefix web ci
npm --prefix web run format:check
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test:unit
npm --prefix web run test:e2e
npm --prefix web run build
git status --short
git diff --check
```
