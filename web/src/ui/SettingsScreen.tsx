import { useState, type ChangeEvent } from 'react';

import type { RemoteCollectorView } from './model';
import { useSpector } from './SpectorContext';

const permissionLabel = (
  permission: 'unknown' | 'unsupported' | PermissionState,
): string => {
  switch (permission) {
    case 'granted':
      return '許可済み';
    case 'denied':
      return '拒否';
    case 'prompt':
      return '未選択';
    case 'unsupported':
      return '確認APIなし';
    case 'unknown':
      return '不明';
  }
};

const formatBytes = (value: number | null): string => {
  if (value === null) return '取得できません';
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MiB`;
  return `${(value / 1_073_741_824).toFixed(2)} GiB`;
};

interface RemoteCardProps {
  readonly remote: RemoteCollectorView;
}

function RemoteCard({ remote }: RemoteCardProps) {
  const { actions } = useSpector();
  const [answer, setAnswer] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const copyOffer = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(remote.offer);
      setCopyMessage('offerをコピーしました。');
    } catch {
      setCopyMessage(
        'コピーできません。テキストを選択してコピーしてください。',
      );
    }
  };

  return (
    <article className="remote-card">
      <div className="remote-card-header">
        <div>
          <h3>{remote.displayName}</h3>
          <p className="mono-id">{remote.peerId}</p>
        </div>
        <span
          className={`connection-state ${remote.state === 'connected' ? 'connected' : ''}`}
        >
          {remote.state === 'connecting'
            ? '接続待ち'
            : remote.state === 'connected'
              ? '接続中'
              : '切断'}
        </span>
      </div>

      <label>
        端末側へ渡すoffer
        <textarea readOnly rows={5} value={remote.offer} />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="secondary-button"
          disabled={remote.offer.length === 0}
          onClick={() => void copyOffer()}
        >
          offerをコピー
        </button>
        <span role="status" className="inline-status">
          {copyMessage}
        </span>
      </div>

      {remote.state === 'connecting' && (
        <>
          <label>
            端末側で生成したanswer
            <textarea
              rows={5}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="answer SDPを貼り付けてください"
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={answer.trim().length === 0}
            onClick={() =>
              void actions.acceptRemoteAnswer(remote.peerId, answer)
            }
          >
            answerを適用
          </button>
        </>
      )}

      {remote.reason !== null && <p className="error-text">{remote.reason}</p>}
      <button
        type="button"
        className="danger-button subtle-danger"
        onClick={() => actions.disconnectRemote(remote.peerId)}
      >
        この端末を切断
      </button>
    </article>
  );
}

export function SettingsScreen() {
  const { state, actions } = useSpector();
  const handleBackupImport = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    if (
      !window.confirm(
        '現在の設定とすべての記録をバックアップ内容で置き換えます。続行しますか？',
      )
    ) {
      return;
    }
    void actions.importBackup(file);
  };

  const handleLegacyImport = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file !== undefined) void actions.importLegacy(file);
  };

  return (
    <div className="screen-grid settings-grid">
      <section className="panel" aria-labelledby="environment-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">利用環境</p>
            <h2 id="environment-title">権限と対応API</h2>
          </div>
        </div>
        <dl className="status-list">
          <div>
            <dt>マイク権限</dt>
            <dd>{permissionLabel(state.microphonePermission)}</dd>
          </div>
          {state.capabilities.map((capability) => (
            <div key={capability.id}>
              <dt>{capability.label}</dt>
              <dd
                className={
                  capability.available
                    ? 'success-text'
                    : capability.required
                      ? 'error-text'
                      : ''
                }
              >
                {capability.available
                  ? '利用可能'
                  : capability.required
                    ? '未対応'
                    : '利用不可'}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel" aria-labelledby="storage-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ストレージ</p>
            <h2 id="storage-title">保存容量</h2>
          </div>
          <button
            type="button"
            className="table-button"
            onClick={() => void actions.refreshStorage()}
          >
            再取得
          </button>
        </div>
        <dl className="metric-grid storage-metrics">
          <div>
            <dt>使用量</dt>
            <dd>{formatBytes(state.storage.usage)}</dd>
          </div>
          <div>
            <dt>空き容量</dt>
            <dd>{formatBytes(state.storage.available)}</dd>
          </div>
          <div>
            <dt>割当上限</dt>
            <dd>{formatBytes(state.storage.quota)}</dd>
          </div>
          <div>
            <dt>永続化</dt>
            <dd>
              {state.storage.persisted === null
                ? '確認できません'
                : state.storage.persisted
                  ? '有効'
                  : '無効'}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void actions.requestPersistentStorage()}
        >
          永続ストレージを要求
        </button>
      </section>

      <section className="panel" aria-labelledby="data-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">データ</p>
            <h2 id="data-title">データ入出力</h2>
          </div>
        </div>
        <div className="settings-action-list">
          <div>
            <h3>Web版バックアップ</h3>
            <p>
              設定、記録、WAVを1つのZIPへ保存し、別のブラウザーへ復元できます。
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void actions.exportBackup()}
              >
                バックアップを保存
              </button>
              <label className="file-button">
                バックアップを復元
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleBackupImport}
                />
              </label>
            </div>
          </div>
          <div>
            <h3>旧WPF版から移行</h3>
            <p>
              ルートにSettings.jsonとRecordフォルダーを含むZIPを読み込みます。重複は取り込みません。
            </p>
            <label className="file-button">
              旧WPF ZIPを読み込む
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleLegacyImport}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="panel full-width" aria-labelledby="remote-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">リモート接続</p>
            <h2 id="remote-title">同一LAN内の端末接続</h2>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => void actions.createRemoteOffer()}
          >
            新しいofferを作成
          </button>
        </div>
        <p>
          外部サーバーは使いません。端末側で <code>#remote</code>{' '}
          を付けたURLを開き、offerとanswerを手動で交換してください。
        </p>
        <div className="remote-grid">
          {state.remotes.map((remote) => (
            <RemoteCard key={remote.peerId} remote={remote} />
          ))}
          {state.remotes.length === 0 && (
            <div className="empty-state">
              接続中のリモート端末はありません。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
