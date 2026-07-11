---
mode: Write
model: sonnet
verify_commands:
  - npm --prefix web run typecheck
  - npm --prefix web run test:unit
  - npm --prefix web run build
depends_on: ["01"]
---

# IndexedDB・WAV・ZIP・旧版移行

`web/src/storage`と`web/src/export`にローカル永続化とデータ移行を実装する。

## 範囲

- `idb`でdatabase `spector` version 1を構成し、`settings`、`records`、`audioBlobs`、`pendingAudioChunks`、`legacyImports`を作る。開始日時indexとlegacy hash一意制約を設ける。
- デフォルト設定、設定保存、記録一覧/取得/削除、Blob取得、一時PCMチャンク追加・列挙・破棄、記録とWAVの確定を`StorageRepository`として実装する。
- 録音開始前の必要容量計算、`navigator.storage.estimate()`、初回保存時の`persist()`要求をサービス化する。QuotaExceededErrorをドメインエラーへ変換する。
- `wavefile`でPCM16 WAV生成と、旧WPF WAVのPCM/IEEE Float/WAVE_FORMAT_EXTENSIBLE/A-law/μ-law読取を行う。解析用Float32列と元Blobを返す。
- `fflate`で以下を実装する。
  - 解析MarkdownとChart PNGのZIP。
  - 1記録のschema v1 JSONと全WAVのZIP。
  - settingsと全記録/WAVを含むWeb版バックアップZIP、および復元。
  - ルート`Settings.json`、`Record/**/record.json + WAV`の旧WPF ZIPインポート。
- 旧record JSONのcamelCase/PascalCaseを受け、方向、Voice、Buzz、volume、端末統計、WAVを新schemaへ写す。旧端末IDは`legacy:`接頭辞で保存し、表示名を維持する。
- `SHA-256(relative path + record JSON bytes)`をlegacy import keyとし、再取込みはskip件数として返す。壊れたJSON、欠落WAV、不正ZIPは一括拒否し、既存DBを変更しない。
- fake-indexeddbでCRUD、チャンク確定、削除cascade、容量エラー、全ZIP往復、旧データ移行、重複防止をテストする。

## 変更境界

- 主に`web/src/storage/**`、`web/src/export/**`、fixture、テストだけを変更する。UI、audio、remote、CI、WPFは変更しない。
- 旧WPFデータ以外の任意フォーマット互換、クラウド同期、暗号化は実装しない。

## 完了条件

- typecheck/unit/buildが成功する。
- StorageRepositoryが後続UI/audioから利用でき、ZIPをBlobとして返せる。
- 失敗したimportが部分書込みを残さない。

commitしてはならない。最後に、変更ファイル一覧、実行したコマンドと結果、確認できていない事項を報告すること。
