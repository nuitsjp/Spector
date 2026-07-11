import { useEffect, useMemo, useRef } from 'react';
import {
  Chart,
  registerables,
  type ChartConfiguration,
  type ChartDataset,
} from 'chart.js';

import type { AudioSource } from '../contracts';
import type { DeviceRecording, RecordingRecord } from '../domain';

import type { LevelPoint } from './model';

Chart.register(...registerables);

const palette = [
  '#512da8',
  '#e91e63',
  '#00796b',
  '#f57c00',
  '#1976d2',
  '#7b1fa2',
  '#388e3c',
  '#c2185b',
];

interface LiveLevelChartProps {
  readonly sources: readonly AudioSource[];
  readonly levels: Readonly<Record<string, readonly LevelPoint[]>>;
  readonly selectedSourceIds?: readonly string[];
  readonly title: string;
}

export function LiveLevelChart({
  sources,
  levels,
  selectedSourceIds,
  title,
}: LiveLevelChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);
  const visibleSources = useMemo(
    () =>
      selectedSourceIds === undefined
        ? sources
        : sources.filter((source) => selectedSourceIds.includes(source.id)),
    [selectedSourceIds, sources],
  );
  const newestTimestamp = Math.max(
    0,
    ...visibleSources.flatMap((source) =>
      (levels[source.id] ?? []).map((point) => point.timestamp),
    ),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let context: CanvasRenderingContext2D | null;
    try {
      context = canvas.getContext('2d');
    } catch {
      return;
    }
    if (context === null) return;

    const datasets: ChartDataset<'line'>[] = visibleSources.map(
      (source, index) => ({
        label: source.displayName,
        data: (levels[source.id] ?? []).map((point) => ({
          x: (point.timestamp - newestTimestamp) / 1_000,
          y: point.level,
        })),
        borderColor: palette[index % palette.length],
        backgroundColor: palette[index % palette.length],
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.15,
      }),
    );
    const configuration: ChartConfiguration<'line'> = {
      type: 'line',
      data: { datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        parsing: false,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: title },
        },
        scales: {
          x: {
            type: 'linear',
            min: -20,
            max: 0,
            title: { display: true, text: '現在からの秒数' },
          },
          y: {
            min: -90,
            max: 0,
            title: { display: true, text: 'dBFS(A)' },
          },
        },
      },
    };
    chartRef.current?.destroy();
    chartRef.current = new Chart(context, configuration);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [levels, newestTimestamp, title, visibleSources]);

  return (
    <section className="chart-section" aria-labelledby="live-chart-title">
      <h3 id="live-chart-title">{title}</h3>
      <div className="chart-frame">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${title}。直近20秒、縦軸は-90から0 dBFS(A)です。`}
          aria-describedby="live-level-values"
        />
      </div>
      <table id="live-level-values" className="data-table compact-table">
        <caption>グラフの現在値</caption>
        <thead>
          <tr>
            <th scope="col">入力</th>
            <th scope="col">現在値</th>
            <th scope="col">接続状態</th>
          </tr>
        </thead>
        <tbody>
          {visibleSources.map((source) => {
            const current = levels[source.id]?.at(-1)?.level;
            return (
              <tr key={source.id}>
                <th scope="row">{source.displayName}</th>
                <td>
                  {current === undefined
                    ? '—'
                    : `${current.toFixed(2)} dBFS(A)`}
                </td>
                <td>
                  {source.state === 'active'
                    ? '接続中'
                    : source.state === 'disconnected'
                      ? '切断'
                      : '停止'}
                </td>
              </tr>
            );
          })}
          {visibleSources.length === 0 && (
            <tr>
              <td colSpan={3}>表示できる入力がありません。</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export interface AnalysisRow {
  readonly key: string;
  readonly record: RecordingRecord;
  readonly device: DeviceRecording;
}

interface AnalysisChartProps {
  readonly rows: readonly AnalysisRow[];
  readonly onCanvas: (canvas: HTMLCanvasElement | null) => void;
}

export function AnalysisChart({ rows, onCanvas }: AnalysisChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'bar'> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    onCanvas(canvas);
    if (canvas === null) return;
    let context: CanvasRenderingContext2D | null;
    try {
      context = canvas.getContext('2d');
    } catch {
      return;
    }
    if (context === null) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(context, {
      type: 'bar',
      data: {
        labels: rows.map(
          (row) =>
            `${new Date(row.record.startedAt).toLocaleString('ja-JP')} ${row.device.displayName}`,
        ),
        datasets: [
          {
            label: 'min',
            data: rows.map((row) => row.device.min),
            backgroundColor: '#9575cd',
          },
          {
            label: 'avg',
            data: rows.map((row) => row.device.avg),
            backgroundColor: '#512da8',
          },
          {
            label: 'max',
            data: rows.map((row) => row.device.max),
            backgroundColor: '#e91e63',
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: '選択した記録の比較' },
        },
        scales: {
          y: {
            min: -90,
            max: 0,
            title: { display: true, text: 'dBFS(A)' },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
      onCanvas(null);
    };
  }, [onCanvas, rows]);

  return (
    <div className="chart-frame analysis-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="選択した記録のmin、avg、maxを比較するグラフ"
        aria-describedby="analysis-values"
      />
    </div>
  );
}
