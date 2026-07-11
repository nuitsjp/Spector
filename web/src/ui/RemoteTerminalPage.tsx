import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AudioDeviceSnapshot,
  BrowserAudioEngine,
  TestNoisePlayback,
} from '../audio';
import type { AudioSource, Unsubscribe } from '../contracts';
import {
  createRemoteTerminalSession,
  type RemoteTerminalSession,
} from '../remote';

interface RemoteTerminalPageProps {
  readonly audioEngine: BrowserAudioEngine;
  readonly closeStorage: () => Promise<void>;
}

export function RemoteTerminalPage({
  audioEngine,
  closeStorage,
}: RemoteTerminalPageProps) {
  const [enabled, setEnabled] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [devices, setDevices] = useState<AudioDeviceSnapshot>({
    inputs: [],
    outputs: [],
  });
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [offer, setOffer] = useState('');
  const [answer, setAnswer] = useState('');
  const [connectionState, setConnectionState] = useState<
    'idle' | 'connecting' | 'connected' | 'disconnected'
  >('idle');
  const [status, setStatus] = useState('音声デバイスを有効化してください。');
  const [copyMessage, setCopyMessage] = useState('');
  const sourceRef = useRef<AudioSource | null>(null);
  const playbackRef = useRef<TestNoisePlayback | null>(null);
  const sessionRef = useRef<RemoteTerminalSession | null>(null);
  const sessionUnsubscribeRef = useRef<Unsubscribe | null>(null);

  useEffect(
    () => () => {
      sessionUnsubscribeRef.current?.();
      sessionRef.current?.disconnect();
      void playbackRef.current?.stop();
      void audioEngine.dispose();
      void closeStorage();
    },
    [audioEngine, closeStorage],
  );

  const activateInput = useCallback(
    async (deviceId: string): Promise<void> => {
      if (sourceRef.current !== null) {
        await audioEngine.stopSource(sourceRef.current.id);
      }
      const source = await audioEngine.startMicrophone(deviceId);
      sourceRef.current = source;
      setSelectedInputId(deviceId);
    },
    [audioEngine],
  );

  const enableAudio = async (): Promise<void> => {
    setEnabling(true);
    setStatus('音声デバイスを有効化しています。');
    try {
      await audioEngine.initialize();
      const snapshot = await audioEngine.refreshDevices();
      setDevices(snapshot);
      const input = snapshot.inputs[0];
      if (input === undefined)
        throw new Error('利用できるマイクが見つかりません。');
      await activateInput(input.id);
      const output = snapshot.outputs[0];
      if (output !== undefined) {
        try {
          await audioEngine.setPlaybackOutput(output.id);
          setSelectedOutputId(output.id);
        } catch {
          setSelectedOutputId('');
        }
      }
      playbackRef.current = audioEngine.createTestNoisePlayback();
      setEnabled(true);
      setStatus('音声デバイスを有効化しました。offerを貼り付けてください。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setEnabling(false);
    }
  };

  const selectInput = async (deviceId: string): Promise<void> => {
    try {
      await activateInput(deviceId);
      setStatus('送信するマイクを変更しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const selectOutput = async (deviceId: string): Promise<void> => {
    try {
      await audioEngine.setPlaybackOutput(deviceId);
      setSelectedOutputId(deviceId);
      setStatus('試験音の再生出力を変更しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const createAnswer = async (): Promise<void> => {
    const source = sourceRef.current;
    const playback = playbackRef.current;
    if (source === null || playback === null) {
      setStatus('先に音声デバイスを有効化してください。');
      return;
    }
    try {
      const session = createRemoteTerminalSession({
        audio: {
          source,
          startTestSignal: async (gain) => playback.start(gain),
          stopTestSignal: async () => playback.stop(),
        },
      });
      sessionRef.current = session;
      sessionUnsubscribeRef.current = session.subscribeState((event) => {
        setConnectionState(event.state);
        if (event.state === 'connected') {
          setStatus('集約側へ音声を送信しています。');
        } else if (event.state === 'disconnected') {
          setStatus(event.reason ?? 'WebRTC接続が切断されました。');
        }
      });
      setConnectionState('connecting');
      setAnswer(await session.acceptOfferAndCreateAnswer(offer));
      setStatus('answerを作成しました。集約側へコピーしてください。');
    } catch (error) {
      setConnectionState('disconnected');
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const copyAnswer = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopyMessage('answerをコピーしました。');
    } catch {
      setCopyMessage(
        'コピーできません。テキストを選択してコピーしてください。',
      );
    }
  };

  const disconnect = (): void => {
    sessionRef.current?.disconnect();
    setConnectionState('disconnected');
    setStatus('接続を終了しました。再接続には新しいofferが必要です。');
  };

  return (
    <main className="remote-terminal-shell">
      <header className="remote-header">
        <div>
          <p className="eyebrow">リモート端末</p>
          <h1>Spector 端末側</h1>
        </div>
        <span
          className={`connection-state ${connectionState === 'connected' ? 'connected' : ''}`}
        >
          {connectionState === 'idle'
            ? '未接続'
            : connectionState === 'connecting'
              ? '接続待ち'
              : connectionState === 'connected'
                ? '送信中'
                : '切断'}
        </span>
      </header>

      <div className="global-status" role="status" aria-live="polite">
        {status}
      </div>

      {!enabled ? (
        <section
          className="panel remote-enable-card"
          aria-labelledby="remote-enable-title"
        >
          <h2 id="remote-enable-title">この端末の音声を有効化</h2>
          <p>
            ユーザー操作後にだけマイク権限を要求します。音声は同一LAN内の集約側へ直接送信されます。
          </p>
          <button
            type="button"
            className="primary-button large-button"
            disabled={enabling}
            onClick={() => void enableAudio()}
          >
            {enabling ? '有効化しています…' : '音声デバイスを有効化'}
          </button>
        </section>
      ) : (
        <div className="remote-steps">
          <section className="panel" aria-labelledby="remote-device-title">
            <p className="step-number">1</p>
            <h2 id="remote-device-title">音声デバイス</h2>
            <div className="form-grid two-columns">
              <label>
                送信するマイク
                <select
                  value={selectedInputId}
                  disabled={connectionState !== 'idle'}
                  onChange={(event) => void selectInput(event.target.value)}
                >
                  {devices.inputs.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                試験音の再生出力
                <select
                  value={selectedOutputId}
                  disabled={connectionState !== 'idle'}
                  onChange={(event) => void selectOutput(event.target.value)}
                >
                  <option value="">ブラウザーの既定出力</option>
                  {devices.outputs.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="panel" aria-labelledby="offer-title">
            <p className="step-number">2</p>
            <h2 id="offer-title">集約側のofferを貼り付け</h2>
            <label>
              offer SDP
              <textarea
                rows={8}
                value={offer}
                disabled={connectionState !== 'idle'}
                onChange={(event) => setOffer(event.target.value)}
                placeholder="設定画面で作成したofferを貼り付けてください"
              />
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={offer.trim().length === 0 || connectionState !== 'idle'}
              onClick={() => void createAnswer()}
            >
              answerを生成
            </button>
          </section>

          <section className="panel" aria-labelledby="answer-title">
            <p className="step-number">3</p>
            <h2 id="answer-title">answerを集約側へ返す</h2>
            <label>
              answer SDP
              <textarea rows={8} readOnly value={answer} />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={answer.length === 0}
                onClick={() => void copyAnswer()}
              >
                answerをコピー
              </button>
              {connectionState !== 'idle' &&
                connectionState !== 'disconnected' && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={disconnect}
                  >
                    接続を終了
                  </button>
                )}
            </div>
            <span role="status" className="inline-status">
              {copyMessage}
            </span>
          </section>
        </div>
      )}
    </main>
  );
}
