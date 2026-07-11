import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { AnalysisChart, type AnalysisRow } from './LevelChart';
import { useSpector } from './SpectorContext';

interface DeleteDialogProps {
  readonly recordLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function DeleteDialog({ recordLabel, onCancel, onConfirm }: DeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const dialogRef = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
  }, []);

  const close = (callback: () => void): void => {
    callback();
    window.setTimeout(() => previousFocusRef.current?.focus(), 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(onCancel);
    } else if (
      event.key === 'Tab' &&
      event.shiftKey &&
      document.activeElement === cancelRef.current
    ) {
      event.preventDefault();
      confirmRef.current?.focus();
    } else if (
      event.key === 'Tab' &&
      !event.shiftKey &&
      document.activeElement === confirmRef.current
    ) {
      event.preventDefault();
      cancelRef.current?.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onKeyDown={onKeyDown}
      >
        <h2 id="delete-dialog-title">記録を削除しますか</h2>
        <p id="delete-dialog-description">
          {recordLabel}{' '}
          と関連するWAVを端末から完全に削除します。この操作は取り消せません。
        </p>
        <div className="button-row dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary-button"
            onClick={() => close(onCancel)}
          >
            キャンセル
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="danger-button"
            onClick={() => close(onConfirm)}
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

export function AnalysisScreen() {
  const { state, actions } = useSpector();
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [selectedDeviceKey, setSelectedDeviceKey] = useState('');
  const [comparisonKeys, setComparisonKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [analysisCanvas, setAnalysisCanvas] =
    useState<HTMLCanvasElement | null>(null);
  const onCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    setAnalysisCanvas(canvas);
  }, []);

  const allRows = useMemo<readonly AnalysisRow[]>(
    () =>
      state.recordings.flatMap((record) =>
        record.deviceRecordings.map((device) => ({
          key: `${record.id}:${device.wavBlobKey}`,
          record,
          device,
        })),
      ),
    [state.recordings],
  );
  const effectiveRecordId = state.recordings.some(
    (record) => record.id === selectedRecordId,
  )
    ? selectedRecordId
    : (state.recordings[0]?.id ?? '');
  const selectedRecord = state.recordings.find(
    (record) => record.id === effectiveRecordId,
  );
  const deviceRows = allRows.filter(
    (row) => row.record.id === effectiveRecordId,
  );
  const effectiveDeviceKey = deviceRows.some(
    (row) => row.key === selectedDeviceKey,
  )
    ? selectedDeviceKey
    : (deviceRows[0]?.key ?? '');
  const selectedRow = allRows.find((row) => row.key === effectiveDeviceKey);
  const comparisonRows = allRows.filter((row) => comparisonKeys.has(row.key));
  const deleteRecord = state.recordings.find(
    (record) => record.id === deleteId,
  );

  const toggleComparison = (key: string, checked: boolean): void => {
    setComparisonKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const confirmDelete = (): void => {
    if (deleteId === null) return;
    const id = deleteId;
    setDeleteId(null);
    setComparisonKeys(
      (current) =>
        new Set([...current].filter((key) => !key.startsWith(`${id}:`))),
    );
    if (effectiveRecordId === id) {
      setSelectedRecordId('');
      setSelectedDeviceKey('');
    }
    void actions.deleteRecording(id);
  };

  return (
    <div className="screen-grid analysis-grid">
      <section
        className="panel selection-panel"
        aria-labelledby="analysis-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">解析</p>
            <h2 id="analysis-title">記録の解析</h2>
          </div>
          <span className="state-chip">{state.recordings.length}件</span>
        </div>

        <div className="form-grid two-columns">
          <label>
            記録（開始日時の新しい順）
            <select
              value={effectiveRecordId}
              onChange={(event) => {
                setSelectedRecordId(event.target.value);
                setSelectedDeviceKey('');
              }}
            >
              {state.recordings.length === 0 && (
                <option value="">記録がありません</option>
              )}
              {state.recordings.map((record) => (
                <option key={record.id} value={record.id}>
                  {new Date(record.startedAt).toLocaleString('ja-JP')} /{' '}
                  {record.direction}° /{' '}
                  {record.status === 'complete' ? '完了' : '不完全'}
                </option>
              ))}
            </select>
          </label>
          <label>
            端末・入力
            <select
              value={effectiveDeviceKey}
              onChange={(event) => setSelectedDeviceKey(event.target.value)}
              disabled={deviceRows.length === 0}
            >
              {deviceRows.length === 0 && (
                <option value="">入力がありません</option>
              )}
              {deviceRows.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.device.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedRecord !== undefined && selectedRow !== undefined ? (
          <dl className="metric-grid">
            <div>
              <dt>状態</dt>
              <dd>
                {selectedRecord.status === 'complete' ? '完了' : '不完全録音'}
              </dd>
            </div>
            <div>
              <dt>min</dt>
              <dd>{selectedRow.device.min.toFixed(2)} dBFS(A)</dd>
            </div>
            <div>
              <dt>avg</dt>
              <dd>{selectedRow.device.avg.toFixed(2)} dBFS(A)</dd>
            </div>
            <div>
              <dt>max</dt>
              <dd>{selectedRow.device.max.toFixed(2)} dBFS(A)</dd>
            </div>
          </dl>
        ) : (
          <div className="empty-state">
            録音が完了すると、ここで統計とWAVを確認できます。
          </div>
        )}

        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={selectedRecord === undefined}
            onClick={() => {
              if (selectedRecord !== undefined)
                void actions.downloadRecording(selectedRecord.id);
            }}
          >
            選択記録のZIPを保存
          </button>
          <button
            type="button"
            className="danger-button subtle-danger"
            disabled={selectedRecord === undefined}
            onClick={() => setDeleteId(selectedRecord?.id ?? null)}
          >
            選択記録を削除
          </button>
        </div>
      </section>

      <section
        className="panel comparison-panel"
        aria-labelledby="comparison-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">比較</p>
            <h2 id="comparison-title">記録比較</h2>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={comparisonRows.length === 0 || analysisCanvas === null}
            onClick={() =>
              analysisCanvas === null
                ? undefined
                : void actions.downloadAnalysis(
                    [...new Set(comparisonRows.map((row) => row.record.id))],
                    analysisCanvas,
                  )
            }
          >
            解析ZIPを保存
          </button>
        </div>

        <AnalysisChart rows={comparisonRows} onCanvas={onCanvas} />
        <div className="table-scroll">
          <table id="analysis-values" className="data-table compact-table">
            <caption>比較対象と信号レベル統計</caption>
            <thead>
              <tr>
                <th scope="col">比較</th>
                <th scope="col">開始日時</th>
                <th scope="col">方位</th>
                <th scope="col">入力</th>
                <th scope="col">min</th>
                <th scope="col">avg</th>
                <th scope="col">max</th>
                <th scope="col">&gt;-30</th>
                <th scope="col">&gt;-40</th>
                <th scope="col">&gt;-50</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <label
                      className="visually-hidden"
                      htmlFor={`compare-${row.key}`}
                    >
                      {row.device.displayName}を比較する
                    </label>
                    <input
                      id={`compare-${row.key}`}
                      type="checkbox"
                      checked={comparisonKeys.has(row.key)}
                      onChange={(event) =>
                        toggleComparison(row.key, event.target.checked)
                      }
                    />
                  </td>
                  <td>
                    {new Date(row.record.startedAt).toLocaleString('ja-JP')}
                  </td>
                  <td>{row.record.direction}°</td>
                  <th scope="row">{row.device.displayName}</th>
                  <td>{row.device.min.toFixed(2)}</td>
                  <td>{row.device.avg.toFixed(2)}</td>
                  <td>{row.device.max.toFixed(2)}</td>
                  <td>{(row.device.aboveMinus30Ratio * 100).toFixed(1)}%</td>
                  <td>{(row.device.aboveMinus40Ratio * 100).toFixed(1)}%</td>
                  <td>{(row.device.aboveMinus50Ratio * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {allRows.length === 0 && (
                <tr>
                  <td colSpan={10}>比較できる記録がありません。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {deleteRecord !== undefined && (
        <DeleteDialog
          recordLabel={new Date(deleteRecord.startedAt).toLocaleString('ja-JP')}
          onCancel={() => setDeleteId(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
