import { useMemo, useState } from 'react';

import {
  DIRECTIONS,
  createPlaybackGain,
  type Direction,
  type SpectorSettings,
} from '../domain';

import { LiveLevelChart } from './LevelChart';
import { useSpector } from './SpectorContext';

const updateRecorder = (
  settings: SpectorSettings,
  update: Partial<SpectorSettings['recorder']>,
): SpectorSettings => ({
  ...settings,
  recorder: { ...settings.recorder, ...update },
});

export function MeasureScreen() {
  const { state, actions } = useSpector();
  const [direction, setDirection] = useState<Direction>(0);
  const sourceById = useMemo(
    () => new Map(state.sources.map((source) => [source.id, source])),
    [state.sources],
  );
  const inputRows = useMemo(() => {
    const microphones = state.devices.inputs.map((device) => {
      const sourceId = `microphone:${device.id}`;
      return {
        id: sourceId,
        deviceId: device.id,
        name: device.label,
        kind: 'マイク',
        source: sourceById.get(sourceId),
      };
    });
    const otherSources = state.sources
      .filter((source) => source.kind !== 'microphone')
      .map((source) => ({
        id: source.id,
        deviceId: null,
        name: source.displayName,
        kind: source.kind === 'remote' ? 'リモート端末' : 'システム音声',
        source,
      }));
    return [...microphones, ...otherSources];
  }, [sourceById, state.devices.inputs, state.sources]);

  const measuredIds = new Set(
    state.settings.devices
      .filter((device) => device.measure)
      .map((device) => device.id),
  );
  const measuredSources = state.sources.filter((source) =>
    measuredIds.has(source.id),
  );

  const setMeasured = (sourceId: string, measure: boolean): void => {
    const settings = state.settings;
    const source = sourceById.get(sourceId);
    const devices = settings.devices.some((device) => device.id === sourceId)
      ? settings.devices.map((device) =>
          device.id === sourceId ? { ...device, measure } : device,
        )
      : [
          ...settings.devices,
          {
            id: sourceId,
            name: source?.displayName ?? sourceId,
            measure,
          },
        ];
    void actions.saveSettings({
      ...settings,
      devices,
      primaryInputId:
        !measure && settings.primaryInputId === sourceId
          ? null
          : settings.primaryInputId,
    });
  };

  return (
    <div className="screen-grid measure-grid">
      <section
        className="panel controls-panel"
        aria-labelledby="measure-settings-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">計測</p>
            <h2 id="measure-settings-title">計測条件</h2>
          </div>
          <span
            className={`state-chip ${state.recording === null ? '' : 'active-chip'}`}
          >
            {state.recording === null ? '待機中' : '録音中'}
          </span>
        </div>

        <div className="form-grid two-columns">
          <label>
            方位
            <select
              value={direction}
              onChange={(event) =>
                setDirection(Number(event.target.value) as Direction)
              }
              disabled={state.recording !== null}
            >
              {DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}°
                </option>
              ))}
            </select>
          </label>
          <label>
            録音時間（秒）
            <input
              type="number"
              min="1"
              max="3600"
              defaultValue={state.settings.recorder.recordingDurationSeconds}
              disabled={state.recording !== null}
              onBlur={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value) && value > 0) {
                  void actions.saveSettings(
                    updateRecorder(state.settings, {
                      recordingDurationSeconds: value,
                    }),
                  );
                }
              }}
            />
          </label>
          <label>
            再生出力
            <select
              value={state.settings.playbackOutputId ?? ''}
              onChange={(event) =>
                void actions.selectPlaybackOutput(event.target.value || null)
              }
              disabled={state.recording !== null}
            >
              <option value="">選択してください</option>
              {state.devices.outputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            再生ゲイン: {Math.round(state.settings.playbackGain * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.settings.playbackGain}
              onChange={(event) =>
                void actions.setPlaybackGain(
                  createPlaybackGain(Number(event.target.value)),
                )
              }
              disabled={state.recording !== null}
            />
          </label>
        </div>

        <fieldset
          className="inline-options"
          disabled={state.recording !== null}
        >
          <legend>録音内容</legend>
          <label>
            <input
              type="checkbox"
              checked={state.settings.recorder.voice}
              onChange={(event) =>
                void actions.saveSettings(
                  updateRecorder(state.settings, {
                    voice: event.target.checked,
                  }),
                )
              }
            />
            発話ありとして記録する
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.settings.recorder.testNoise}
              onChange={(event) =>
                void actions.saveSettings(
                  updateRecorder(state.settings, {
                    testNoise: event.target.checked,
                  }),
                )
              }
            />
            試験音を再生する
          </label>
        </fieldset>

        {state.recording !== null && (
          <div className="recording-progress">
            <div className="progress-label">
              <span>録音進捗</span>
              <strong>
                {(state.recording.elapsedMilliseconds / 1_000).toFixed(1)} /{' '}
                {(state.recording.durationMilliseconds / 1_000).toFixed(1)} 秒
              </strong>
            </div>
            <progress
              aria-label="録音進捗"
              max={100}
              value={state.recording.ratio * 100}
            />
          </div>
        )}

        <div className="button-row">
          {state.recording === null ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void actions.startRecording({ direction })}
            >
              録音を開始
            </button>
          ) : (
            <button
              type="button"
              className="danger-button"
              onClick={() => void actions.stopRecording()}
            >
              録音を停止
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => void actions.addSystemAudio()}
            disabled={
              state.recording !== null ||
              !state.capabilities.find((item) => item.id === 'system-audio')
                ?.available
            }
          >
            システム音声を追加
          </button>
        </div>
      </section>

      <section className="panel inputs-panel" aria-labelledby="inputs-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">入力</p>
            <h2 id="inputs-title">計測入力</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <caption>利用できるマイク、システム音声、リモート端末</caption>
            <thead>
              <tr>
                <th scope="col">名前</th>
                <th scope="col">種類</th>
                <th scope="col">主入力</th>
                <th scope="col">計測対象</th>
                <th scope="col">音声形式</th>
                <th scope="col">接続状態</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((row) => {
                const active = row.source?.state === 'active';
                const measured = measuredIds.has(row.id);
                return (
                  <tr key={row.id}>
                    <th scope="row">{row.name}</th>
                    <td>{row.kind}</td>
                    <td>
                      <label
                        className="visually-hidden"
                        htmlFor={`primary-${row.id}`}
                      >
                        {row.name}を主入力にする
                      </label>
                      <input
                        id={`primary-${row.id}`}
                        type="radio"
                        name="primary-input"
                        checked={state.settings.primaryInputId === row.id}
                        disabled={
                          !active || !measured || state.recording !== null
                        }
                        onChange={() =>
                          void actions.saveSettings({
                            ...state.settings,
                            primaryInputId: row.id,
                          })
                        }
                      />
                    </td>
                    <td>
                      <label
                        className="visually-hidden"
                        htmlFor={`measure-${row.id}`}
                      >
                        {row.name}を計測対象にする
                      </label>
                      <input
                        id={`measure-${row.id}`}
                        type="checkbox"
                        checked={measured}
                        disabled={!active || state.recording !== null}
                        onChange={(event) =>
                          setMeasured(row.id, event.target.checked)
                        }
                      />
                    </td>
                    <td>
                      {row.source?.format === null || row.source === undefined
                        ? '—'
                        : `${row.source.format.sampleRate / 1_000} kHz / ${row.source.format.channels} ch`}
                    </td>
                    <td>
                      <span
                        className={`connection-state ${active ? 'connected' : ''}`}
                      >
                        {active
                          ? '接続中'
                          : row.source?.state === 'disconnected'
                            ? '切断'
                            : '未接続'}
                      </span>
                    </td>
                    <td>
                      {row.kind === 'リモート端末' ? (
                        <span>設定画面で管理</span>
                      ) : active ? (
                        <button
                          type="button"
                          className="table-button"
                          disabled={state.recording !== null}
                          onClick={() => void actions.stopSource(row.id)}
                        >
                          停止
                        </button>
                      ) : row.deviceId !== null ? (
                        <button
                          type="button"
                          className="table-button"
                          disabled={state.recording !== null}
                          onClick={() =>
                            void actions.startMicrophone(row.deviceId)
                          }
                        >
                          接続
                        </button>
                      ) : (
                        <span>再追加してください</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {inputRows.length === 0 && (
                <tr>
                  <td colSpan={7}>利用できる音声入力がありません。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="panel chart-panel full-width">
        <LiveLevelChart
          sources={measuredSources}
          levels={state.levels}
          title="ライブ信号レベル（直近20秒）"
        />
      </div>
    </div>
  );
}
