---
mode: Write
model: opus
verify_commands:
  - npm --prefix web run format:check
  - npm --prefix web run lint
  - npm --prefix web run typecheck
  - npm --prefix web run test:unit
  - npm --prefix web run test:e2e
  - npm --prefix web run build
depends_on: ["02", "03", "04"]
---

# 日本語UIと全機能統合

完成済みのdomain/audio/storage/remoteを統合し、`web/src/ui`とAppを本番利用可能なSPAへする。

## 範囲

- アプリ名Spector、日本語のみ、Deep Purple/Pink、1024px以上のデスクトップ向け。React Context+Reducer、外部状態管理なし。
- 初回onboardingで対応APIを検査し、「音声デバイスを有効化」のユーザー操作からAudioContextと権限を初期化する。未対応・拒否・端末なしを明示し、勝手に権限要求しない。
- WAI-ARIA準拠のMeasure/Analysis/Speaker Calibration/Settingsタブを作る。左右/Home/End、Tab、Enter/Space、可視focusを実装する。
- Measure:
  - 主入力、8方位、Voiceメタデータ、試験音、録音時間、再生出力、再生ゲイン、録音/停止/進捗。
  - 入力表でマイク、追加したシステム音声、remoteを表示し、名前、計測対象、format、接続状態を扱う。
  - 40Hzデータを保持してChart.jsを最大10fps更新、直近20秒、-90..0dBFS(A)、凡例と現在値表を表示。
- Analysis:
  - Record→Process→Device相当の選択、開始降順、min/avg/max、3閾値比率、比較checkbox、複数系列チャート。
  - 削除は確認dialog、選択解除も整合。解析ZIP、記録ZIPをdownloadする。
- Speaker Calibration:
  - 計測入力、再生出力、ゲイン、試験音、校正点編集、選択入力のライブチャート。編集はIndexedDBへ保存。
- Settings:
  - 権限/API/永続化/容量状態、persist要求、Web版backup export/import、旧WPF ZIP import結果。
  - 集約側offer/answer操作と接続remote一覧。`#remote`では端末側の入力/出力選択、offer貼付、answer生成、音声有効化、接続状態だけを表示。
- 不完全録音、容量不足、端末切断、WebRTC異常、ZIP不正を日本語のstatus/live regionへ表示する。
- Canvasには代替表、全入力にlabel、icon-only禁止、progressbar、aria-pressed、dialog focus管理を実装する。
- Testing Libraryで主要状態、Playwrightでonboarding、権限拒否、タブ、録音fake、永続化、削除、ZIP、remote二画面、axeを検証する。fake audioを使い実機には接続しない。

## 変更境界

- `web/src/ui/**`、App、CSS、UIテスト、Playwright設定/fixtureを変更する。domain wire formatとDB schemaは必要な不具合修正以外変更しない。
- WPF、CI、README、`.gitignore`は変更しない。

## 完了条件

- 全verify commandが成功する。
- production previewを最新Edge/Chromiumで描画し、4タブと`#remote`をスクリーンショット確認できる。
- 既存モジュールの公開APIがUIから実際に呼ばれており、ダミー画面だけで終わっていない。

commitしてはならない。最後に、変更ファイル一覧、実行したコマンドと結果、確認できていない事項を報告すること。
