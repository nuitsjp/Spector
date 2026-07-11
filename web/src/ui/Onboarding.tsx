import { useSpector } from './SpectorContext';

export function Onboarding() {
  const { state, actions } = useSpector();
  const unsupported = state.capabilities.filter(
    (capability) => capability.required && !capability.available,
  );

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <p className="eyebrow">ブラウザー音響計測</p>
        <h1 id="onboarding-title">Spector</h1>
        <p className="lead">
          音声はこの端末内で処理され、録音と設定はブラウザーへ保存されます。
        </p>

        <h2>利用環境の確認</h2>
        <ul className="capability-list">
          {state.capabilities.map((capability) => (
            <li key={capability.id}>
              <span
                aria-hidden="true"
                className={capability.available ? 'ok-dot' : 'error-dot'}
              />
              <span>{capability.label}</span>
              <strong>
                {capability.available
                  ? '利用可能'
                  : capability.required
                    ? '未対応'
                    : '利用不可'}
              </strong>
            </li>
          ))}
        </ul>

        {unsupported.length > 0 && (
          <div className="notice error-notice" role="alert">
            必須APIに対応していません。Windows 11の最新Microsoft
            EdgeからHTTPSで開いてください。
          </div>
        )}

        {state.activation === 'error' && (
          <div className="notice error-notice" role="alert">
            {state.statusMessage}
            <br />
            Edgeのサイト設定でマイクを許可し、接続状態を確認してから再試行してください。
          </div>
        )}

        <button
          type="button"
          className="primary-button large-button"
          onClick={() => void actions.enableAudio()}
          disabled={
            unsupported.length > 0 ||
            state.activation === 'enabling' ||
            state.loading
          }
        >
          {state.activation === 'enabling'
            ? '有効化しています…'
            : '音声デバイスを有効化'}
        </button>
        <p className="privacy-note">
          このボタンを押すまで、マイク権限は要求しません。
        </p>
      </section>
    </main>
  );
}
