import { useMemo, useState } from 'react';

import { createCalibrationLevelDb, createPlaybackGain } from '../domain';

import { LiveLevelChart } from './LevelChart';
import { useSpector } from './SpectorContext';

interface CalibrationDraft {
  readonly id: string;
  readonly levelDb: string;
  readonly example: string;
  readonly playbackGain: string;
}

export function CalibrationScreen() {
  const { state, actions } = useSpector();
  const [selectedInputId, setSelectedInputId] = useState(
    state.settings.primaryInputId ?? state.sources[0]?.id ?? '',
  );
  const [noisePlaying, setNoisePlaying] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [drafts, setDrafts] = useState<readonly CalibrationDraft[]>(() =>
    state.settings.calibrationPoints.map((point, index) => ({
      id: `point-${index + 1}`,
      levelDb: String(point.levelDb),
      example: point.example,
      playbackGain: String(point.playbackGain),
    })),
  );
  const selectedSource = useMemo(
    () => state.sources.find((source) => source.id === selectedInputId),
    [selectedInputId, state.sources],
  );

  const updateDraft = (
    id: string,
    field: keyof Omit<CalibrationDraft, 'id'>,
    value: string,
  ): void => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, [field]: value } : draft,
      ),
    );
  };

  const saveCalibration = async (): Promise<void> => {
    try {
      const calibrationPoints = drafts.map((draft) => ({
        levelDb: createCalibrationLevelDb(Number(draft.levelDb)),
        example: draft.example,
        playbackGain: createPlaybackGain(Number(draft.playbackGain)),
      }));
      const saved = await actions.saveSettings({
        ...state.settings,
        calibrationPoints,
      });
      setValidationMessage(
        saved ? '校正点を保存しました。' : '校正点を保存できませんでした。',
      );
    } catch (error) {
      setValidationMessage(
        `校正点を保存できません。${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const toggleNoise = async (): Promise<void> => {
    try {
      if (noisePlaying) {
        await actions.stopTestNoise();
        setNoisePlaying(false);
      } else {
        await actions.startTestNoise();
        setNoisePlaying(true);
      }
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <div className="screen-grid calibration-grid">
      <section
        className="panel controls-panel"
        aria-labelledby="calibration-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">スピーカー校正</p>
            <h2 id="calibration-title">スピーカー校正</h2>
          </div>
        </div>
        <p>
          計測マイクのライブdBFS(A)を確認しながら、サイト内の再生ゲインと校正点を調整します。
        </p>

        <div className="form-grid two-columns">
          <label>
            計測入力
            <select
              value={selectedSource?.id ?? ''}
              onChange={(event) => setSelectedInputId(event.target.value)}
            >
              <option value="">選択してください</option>
              {state.sources
                .filter((source) => source.state === 'active')
                .map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.displayName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            再生出力
            <select
              value={state.settings.playbackOutputId ?? ''}
              onChange={(event) =>
                void actions.selectPlaybackOutput(event.target.value || null)
              }
            >
              <option value="">選択してください</option>
              {state.devices.outputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <label className="full-field">
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
            />
          </label>
        </div>
        <button
          type="button"
          className={noisePlaying ? 'danger-button' : 'primary-button'}
          aria-pressed={noisePlaying}
          onClick={() => void toggleNoise()}
        >
          {noisePlaying ? '試験音を停止' : '試験音を再生'}
        </button>
      </section>

      <div className="panel chart-panel">
        <LiveLevelChart
          sources={selectedSource === undefined ? [] : [selectedSource]}
          levels={state.levels}
          title="校正入力のライブ信号レベル"
        />
      </div>

      <section className="panel full-width" aria-labelledby="points-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">校正点</p>
            <h2 id="points-title">校正点</h2>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setDrafts((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  levelDb: String(
                    Math.max(
                      0,
                      ...current.map((item) => Number(item.levelDb) || 0),
                    ) + 5,
                  ),
                  example: '',
                  playbackGain: '0.5',
                },
              ])
            }
          >
            校正点を追加
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table calibration-table">
            <caption>校正基準値と再生ゲインの対応</caption>
            <thead>
              <tr>
                <th scope="col">校正基準値（dB）</th>
                <th scope="col">例</th>
                <th scope="col">再生ゲイン（0〜1）</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>
                    <label
                      className="visually-hidden"
                      htmlFor={`level-${draft.id}`}
                    >
                      校正基準値
                    </label>
                    <input
                      id={`level-${draft.id}`}
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={draft.levelDb}
                      onChange={(event) =>
                        updateDraft(draft.id, 'levelDb', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <label
                      className="visually-hidden"
                      htmlFor={`example-${draft.id}`}
                    >
                      音量の例
                    </label>
                    <input
                      id={`example-${draft.id}`}
                      type="text"
                      value={draft.example}
                      onChange={(event) =>
                        updateDraft(draft.id, 'example', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <label
                      className="visually-hidden"
                      htmlFor={`gain-${draft.id}`}
                    >
                      再生ゲイン
                    </label>
                    <input
                      id={`gain-${draft.id}`}
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={draft.playbackGain}
                      onChange={(event) =>
                        updateDraft(
                          draft.id,
                          'playbackGain',
                          event.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-button danger-text"
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((item) => item.id !== draft.id),
                        )
                      }
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void saveCalibration()}
          >
            校正点を保存
          </button>
          <span className="inline-status" role="status" aria-live="polite">
            {validationMessage}
          </span>
        </div>
      </section>
    </div>
  );
}
