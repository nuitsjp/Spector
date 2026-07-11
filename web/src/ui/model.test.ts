import { describe, expect, it } from 'vitest';

import { createSignalLevelDbfs } from '../domain';
import { createDefaultSettings } from '../storage';

import { appReducer, type AppState } from './model';

const state = (): AppState => ({
  selectedTab: 'measure',
  capabilities: [],
  activation: 'idle',
  microphonePermission: 'unknown',
  devices: { inputs: [], outputs: [] },
  sources: [],
  levels: {},
  settings: createDefaultSettings(),
  recordings: [],
  loading: false,
  recording: null,
  storage: { quota: null, usage: null, available: null, persisted: null },
  remotes: [],
  statusMessage: '',
  statusTone: 'info',
});

describe('appReducer', () => {
  it('直近20秒の40Hzレベル点だけを保持する', () => {
    const first = appReducer(state(), {
      type: 'flush-levels',
      points: [
        {
          sourceId: 'mic',
          timestamp: 1_000,
          level: createSignalLevelDbfs(-50),
        },
        {
          sourceId: 'mic',
          timestamp: 20_000,
          level: createSignalLevelDbfs(-40),
        },
      ],
    });
    const second = appReducer(first, {
      type: 'flush-levels',
      points: [
        {
          sourceId: 'mic',
          timestamp: 22_000,
          level: createSignalLevelDbfs(-30),
        },
      ],
    });

    expect(second.levels.mic?.map((point) => point.timestamp)).toEqual([
      20_000, 22_000,
    ]);
  });

  it('タブとlive regionの状態を更新する', () => {
    const selected = appReducer(state(), {
      type: 'select-tab',
      tab: 'analysis',
    });
    const reported = appReducer(selected, {
      type: 'status',
      message: '容量不足です。',
      tone: 'error',
    });

    expect(reported.selectedTab).toBe('analysis');
    expect(reported.statusMessage).toBe('容量不足です。');
    expect(reported.statusTone).toBe('error');
  });
});
