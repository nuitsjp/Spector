# Spector

Spectorは、複数のマイクや同一LAN内の端末から音声を収録し、A特性を適用した信号レベルを比較する静的Webアプリケーションです。バックエンドやクラウド保存は使用せず、録音、設定、解析結果をブラウザー内で管理します。

公開URL: <https://nuitsjp.github.io/Spector/>

## 対応環境

- Windows 11上の最新Microsoft Edge
- HTTPSで配信される公開URL、または開発時のlocalhost
- 1024ピクセル以上のデスクトップ表示

Chrome、Firefox、Safari、モバイル端末、LAN外の端末接続は対象外です。ブラウザーの制約により、システム音声を計測する場合は、画面共有の選択画面でユーザーが対象と音声共有を明示的に許可する必要があります。

## 利用開始

1. 公開URLをMicrosoft Edgeで開きます。
2. 「音声デバイスを有効化」を押します。この操作を行うまでマイク権限は要求されません。
3. Edgeの権限画面でマイクを許可します。
4. Measureタブで計測対象と主入力を選び、「録音を開始」を押します。

Measure、Analysis、Speaker Calibration、Settingsの4タブを利用できます。試験音は固定シードから生成するノイズであり、公開成果物に外部音源は含まれません。

## 権限とデータ保存

マイクにはEdgeのマイク権限を使います。システム音声には画面共有権限を使い、出力先の選択はEdgeが対応する範囲に限られます。「再生ゲイン」はSpectorが再生する試験音だけに作用し、Windowsのマスター音量は変更しません。

録音、設定、履歴は、利用中のEdgeプロファイルのIndexedDBへ保存されます。サーバーへの送信やクラウド同期は行いません。サイトデータの消去、Edgeプロファイルの削除、ストレージの自動整理によって失われる可能性があるため、Settingsタブから定期的にバックアップZIPを保存してください。「永続ストレージを要求」は削除されにくくするためのブラウザーへの要求であり、保持を保証するものではありません。

バックアップZIPの復元は、現在の設定とすべての記録をバックアップ内容で置き換えます。必要なデータを先に書き出してから実行してください。

## 旧WPF版のデータ移行

旧版の `Settings.json` と `Record/` を次の構造で1つのZIPにまとめ、Settingsタブの「旧WPF ZIPを読み込む」から選択します。

```text
Settings.json
Record/
  .../record.json
  .../*.wav
```

旧端末の表示名と履歴は引き継ぎますが、Windowsの端末IDをブラウザーの端末IDへ自動対応できないため、移行後の初回計測時に入力を選び直してください。同じ内容のZIPはSHA-256で判定し、重複して取り込みません。リポジトリ直下の `Settings.json` と `Record/` はローカル移行用データとしてGitの管理対象外にしています。

## 同一LAN内の端末接続

WebRTC接続は外部シグナリングサーバーとSTUN/TURNサーバーを使いません。集約側と端末側を同じLANへ接続し、offerとanswerを手動で交換します。

1. 集約側のSettingsタブで「新しいofferを作成」を押し、offerをコピーします。
2. 端末側で公開URLの末尾に `#remote` を付けた <https://nuitsjp.github.io/Spector/#remote> を開きます。
3. 端末側で音声デバイスを有効化し、offerを貼り付けてanswerを生成します。
4. answerを集約側へ戻して適用します。

接続が切れた場合は自動再接続せず、新しいofferから再ペアリングします。端末やネットワークの構成によっては、同一LAN内でもブラウザー間の直接接続を確立できない場合があります。

## 開発

Node.js 24とnpm 11を使用します。

```powershell
cd web
npm ci
npm run dev
```

開発サーバーは、表示されたポートの `/Spector/`（通常は `http://localhost:5173/Spector/`）を開きます。変更を提出する前に次を実行してください。

```powershell
cd web
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run build
```

本番ビルドは `web/dist/` に生成されます。Viteのベースパスは `/Spector/` に固定しています。

## GitHub Pagesへの公開

リポジトリのSettingsで、PagesのBuild and deploymentのSourceを「GitHub Actions」に設定します。`main`へのpush、または「Deploy GitHub Pages」ワークフローの手動実行によって、`web/dist/` がGitHub Pagesへ配備されます。

Pull Requestでは「Verify web application」ワークフローがフォーマット、lint、型検査、単体テスト、E2Eテスト、本番ビルドを検証します。リポジトリのブランチ保護でこのチェックを必須にしてください。

## ライセンス

[MIT License](LICENSE)
