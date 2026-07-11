---
mode: Write
model: sonnet
verify_commands:
  - npm --prefix web run format:check
  - npm --prefix web run lint
  - npm --prefix web run typecheck
  - npm --prefix web run test:unit
  - npm --prefix web run test:e2e
  - npm --prefix web run build
  - git diff --check
depends_on: ["05"]
---

# GitHub Pages公開設定とWPF除去

完成済みWeb版を公開可能にし、最終リポジトリからWPFを除去する。README本文は親エージェントが作成するため触らない。

## 範囲

- `.github/workflows/check.yml`を追加し、PRとmain pushでNode.js 24、`npm ci`、format/lint/typecheck/unit/e2e/buildを実行する。
- `.github/workflows/pages.yml`を追加し、main pushとworkflow_dispatchだけで検証後に`web/dist`をPagesへdeployする。`contents: read`、`pages: write`、`id-token: write`、`github-pages` environment、concurrencyを設定する。
- 公式`checkout`、`setup-node`、`configure-pages`、`upload-pages-artifact`、`deploy-pages`を2026-07時点の現行majorに合わせ、コメント付きの完全commit SHAへ固定する。
- `.gitignore`へルート`/Settings.json`、`/Record/`、`web/node_modules/`、`web/dist/`、Playwright出力を追加する。ユーザー実データは削除しない。
- Web版テストが通ることを確認してから、追跡対象`Spector/`ディレクトリ全体を削除する。これによりsln、csproj、XAML、C#、未確認WAVを除去する。
- LICENSE、docs計画、web、ユーザーの未追跡Settings/Recordは保持する。

## 制約

- commit、push、GitHub Pages設定変更、実サイトdeployは行わない。
- READMEは変更しない。
- Web版の機能コードを便宜的に削って検証を通してはならない。

## 完了条件

- verify commandが成功する。
- `git status`でWPF削除、web/CI追加、ユーザーSettings/Record非表示（ignore）が確認できる。
- Pages artifact pathとVite baseが`web/dist`、`/Spector/`で一致する。

commitしてはならない。最後に、変更ファイル一覧、実行したコマンドと結果、確認できていない事項を報告すること。
