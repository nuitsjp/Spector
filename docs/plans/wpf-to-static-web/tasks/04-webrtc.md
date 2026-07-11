---
mode: Write
model: opus
verify_commands:
  - npm --prefix web run typecheck
  - npm --prefix web run test:unit
  - npm --prefix web run build
depends_on: ["01"]
---

# 手動WebRTC端末連携

`web/src/remote`に外部サーバーなし・同一LAN向けの手動WebRTC連携を実装する。

## 範囲

- `RTCPeerConnection({iceServers: []})`を使い、集約側offer生成→端末側貼付/answer生成→集約側貼付のAPIを作る。SDPはICE gathering完了後の文字列を渡す。
- ordered/reliableな`control-v1`と`pcm-v1`の2 DataChannelを作る。
- control JSONは`v:1`とし、hello、startTestSignal、stopTestSignal、disconnect、errorを扱う。未知version/typeは接続エラーにする。
- PCMは50msのlittle-endian PCM16。固定ヘッダーへversion、sequence uint32、capture timestamp float64、sample count uint32を格納する。helloでsampleRate/channels/sourceId/nameを伝える。
- sequence欠落・逆転、format不一致、channel closeはremote sourceを切断し、録音中なら上位へincomplete理由を通知する。
- 端末側はAudioエンジンへPCMフレーム購読と試験音開始/停止を委譲し、集約側は`AudioSource`互換のremote sourceとレベル/PCMイベントを公開する。
- 接続情報は永続化しない。切断後は再ペアリングが必要。同一LAN外、STUN/TURN、シグナリング、QR、自動再接続は実装しない。
- RTCPeerConnection/DataChannel fakeを用いてoffer/answer状態、制御message、PCM header roundtrip、連番異常、切断をVitestで検証する。

## 変更境界

- 主に`web/src/remote/**`とテストだけを変更する。UI、storage、CI、WPFは変更しない。
- `src/contracts`不足時の最小拡張は可。remote音声をOpus trackで送らず、PCM DataChannelだけを使う。

## 完了条件

- typecheck/unit/buildが成功する。
- 集約側・端末側APIとremote sourceがexportされる。
- control/PCM wire formatがテストで固定される。

commitしてはならない。最後に、変更ファイル一覧、実行したコマンドと結果、確認できていない事項を報告すること。
