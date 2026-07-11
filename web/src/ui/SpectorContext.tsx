/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type PropsWithChildren,
} from 'react';

import {
  AudioEngineError,
  type RecordingSessionResult,
  type RecordingSessionService,
  type RecordingStateEvent,
} from '../audio';
import type { AudioSource, Unsubscribe } from '../contracts';
import {
  createAnalysisArchive,
  createRecordingArchive,
  createWebBackupArchive,
  importLegacyWpfArchive,
  restoreWebBackupArchive,
} from '../export';
import {
  CONTROL_PROTOCOL_VERSION,
  type Direction,
  type PlaybackGain,
  type RecordingRecord,
  type SpectorSettings,
} from '../domain';
import type { RemoteCollectorSession } from '../remote';
import { createDefaultSettings } from '../storage';

import {
  hasRequiredBrowserCapabilities,
  inspectBrowserCapabilities,
  readMicrophonePermission,
} from './browserSupport';
import { canvasToPng, downloadBlob } from './downloads';
import {
  appReducer,
  type AppState,
  type LevelPoint,
  type MainTab,
  type RemoteCollectorView,
} from './model';
import { createRecordingRecord } from './recordingMapper';
import { createSpectorServices, type SpectorServices } from './services';

interface StartRecordingInput {
  readonly direction: Direction;
}

export interface SpectorActions {
  readonly selectTab: (tab: MainTab) => void;
  readonly enableAudio: () => Promise<void>;
  readonly startMicrophone: (deviceId: string) => Promise<void>;
  readonly stopSource: (sourceId: string) => Promise<void>;
  readonly addSystemAudio: () => Promise<void>;
  readonly saveSettings: (settings: SpectorSettings) => Promise<boolean>;
  readonly selectPlaybackOutput: (deviceId: string | null) => Promise<void>;
  readonly setPlaybackGain: (gain: PlaybackGain) => Promise<void>;
  readonly startRecording: (input: StartRecordingInput) => Promise<void>;
  readonly stopRecording: () => Promise<void>;
  readonly deleteRecording: (recordingId: string) => Promise<void>;
  readonly downloadRecording: (recordingId: string) => Promise<void>;
  readonly downloadAnalysis: (
    recordingIds: readonly string[],
    canvas: HTMLCanvasElement,
  ) => Promise<void>;
  readonly startTestNoise: () => Promise<void>;
  readonly stopTestNoise: () => Promise<void>;
  readonly refreshStorage: () => Promise<void>;
  readonly requestPersistentStorage: () => Promise<void>;
  readonly exportBackup: () => Promise<void>;
  readonly importBackup: (file: File) => Promise<void>;
  readonly importLegacy: (file: File) => Promise<void>;
  readonly createRemoteOffer: () => Promise<void>;
  readonly acceptRemoteAnswer: (
    peerId: string,
    answer: string,
  ) => Promise<void>;
  readonly disconnectRemote: (peerId: string) => void;
}

export interface SpectorContextValue {
  readonly state: AppState;
  readonly actions: SpectorActions;
}

const SpectorContext = createContext<SpectorContextValue | null>(null);

const emptyStorage: AppState['storage'] = {
  quota: null,
  usage: null,
  available: null,
  persisted: null,
};

const createInitialState = (): AppState => {
  const capabilities = inspectBrowserCapabilities();
  return {
    selectedTab: 'measure',
    capabilities,
    activation: hasRequiredBrowserCapabilities(capabilities)
      ? 'idle'
      : 'unsupported',
    microphonePermission: 'unknown',
    devices: { inputs: [], outputs: [] },
    sources: [],
    levels: {},
    settings: createDefaultSettings(),
    recordings: [],
    loading: true,
    recording: null,
    storage: emptyStorage,
    remotes: [],
    statusMessage: 'Spectorを準備しています。',
    statusTone: 'info',
  };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const recordingStoppedMessage = (result: RecordingSessionResult): string => {
  if (result.status === 'complete') {
    return result.reason === 'manual'
      ? '録音を停止し、記録を保存しました。'
      : '録音が完了し、記録を保存しました。';
  }
  const detail = result.detail === null ? '' : ` ${result.detail}`;
  return `録音は不完全な状態で停止しました（${result.reason}）。${detail}`;
};

const createAnalysisMarkdown = (
  records: readonly RecordingRecord[],
): string => {
  const rows = records.flatMap((record) =>
    record.deviceRecordings.map(
      (device) =>
        `| ${record.startedAt} | ${record.direction}° | ${device.displayName} | ${device.min.toFixed(2)} | ${device.avg.toFixed(2)} | ${device.max.toFixed(2)} | ${(device.aboveMinus30Ratio * 100).toFixed(1)}% | ${(device.aboveMinus40Ratio * 100).toFixed(1)}% | ${(device.aboveMinus50Ratio * 100).toFixed(1)}% |`,
    ),
  );
  return [
    '# Spector 解析結果',
    '',
    '| 開始日時 | 方位 | 入力 | min dBFS(A) | avg dBFS(A) | max dBFS(A) | >-30 | >-40 | >-50 |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
  ].join('\n');
};

interface CollectorRuntime {
  readonly session: RemoteCollectorSession;
  unsubscribe: Unsubscribe;
  offer: string;
}

export interface SpectorProviderProps extends PropsWithChildren {
  readonly services?: SpectorServices;
}

export function SpectorProvider({
  children,
  services: providedServices,
}: SpectorProviderProps) {
  const services = useMemo(
    () => providedServices ?? createSpectorServices(),
    [providedServices],
  );
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    createInitialState,
  );
  const settingsRef = useRef(state.settings);
  const sourcesRef = useRef(new Map<string, AudioSource>());
  const sourceSubscriptionsRef = useRef(new Map<string, Unsubscribe[]>());
  const pendingLevelsRef = useRef<LevelPoint[]>([]);
  const recordingSessionRef = useRef<RecordingSessionService | null>(null);
  const recordingUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const testNoiseRef = useRef<ReturnType<
    SpectorServices['audioEngine']['createTestNoisePlayback']
  > | null>(null);
  const collectorsRef = useRef(new Map<string, CollectorRuntime>());

  const setStatus = useCallback(
    (message: string, tone: AppState['statusTone'] = 'info') => {
      dispatch({ type: 'status', message, tone });
    },
    [],
  );

  const refreshRecordings = useCallback(async () => {
    dispatch({
      type: 'set-recordings',
      value: await services.repository.listRecordings(),
    });
  }, [services.repository]);

  const refreshStorage = useCallback(async () => {
    try {
      const estimate = await services.quota.estimate();
      const persisted =
        typeof navigator.storage?.persisted === 'function'
          ? await navigator.storage.persisted()
          : null;
      dispatch({ type: 'set-storage', value: { ...estimate, persisted } });
    } catch {
      dispatch({ type: 'set-storage', value: emptyStorage });
    }
  }, [services.quota]);

  const saveSettings = useCallback(
    async (settings: SpectorSettings) => {
      settingsRef.current = settings;
      dispatch({ type: 'set-settings', value: settings });
      try {
        await services.repository.saveSettings(settings);
        await refreshStorage();
        return true;
      } catch (error) {
        setStatus(
          `設定を保存できませんでした。${errorMessage(error)}`,
          'error',
        );
        return false;
      }
    },
    [refreshStorage, services.repository, setStatus],
  );

  const updateDeviceSetting = useCallback(
    async (source: AudioSource, measure = true) => {
      const current = settingsRef.current;
      const existing = current.devices.find(
        (device) => device.id === source.id,
      );
      const devices =
        existing === undefined
          ? [
              ...current.devices,
              { id: source.id, name: source.displayName, measure },
            ]
          : current.devices.map((device) =>
              device.id === source.id
                ? { ...device, name: source.displayName, measure }
                : device,
            );
      const primaryInputId =
        current.primaryInputId === null && measure
          ? source.id
          : current.primaryInputId;
      await saveSettings({ ...current, devices, primaryInputId });
    },
    [saveSettings],
  );

  const detachSource = useCallback((sourceId: string) => {
    for (const unsubscribe of sourceSubscriptionsRef.current.get(sourceId) ??
      []) {
      unsubscribe();
    }
    sourceSubscriptionsRef.current.delete(sourceId);
    sourcesRef.current.delete(sourceId);
    dispatch({ type: 'remove-source', sourceId });
  }, []);

  const attachSource = useCallback(
    (source: AudioSource) => {
      if (sourcesRef.current.has(source.id)) {
        dispatch({ type: 'upsert-source', source });
        return;
      }
      sourcesRef.current.set(source.id, source);
      sourceSubscriptionsRef.current.set(source.id, [
        source.subscribeLevel((event) => {
          pendingLevelsRef.current.push({
            sourceId: event.sourceId,
            timestamp: event.timestamp,
            level: event.level,
          });
        }),
        source.subscribeDisconnected((event) => {
          dispatch({ type: 'upsert-source', source });
          setStatus(`入力が切断されました。${event.reason}`, 'error');
        }),
      ]);
      dispatch({ type: 'upsert-source', source });
    },
    [setStatus],
  );

  const finalizeRecording = useCallback(
    async (result: RecordingSessionResult) => {
      try {
        const finalized = createRecordingRecord(result);
        await services.repository.finalizeRecording(
          result.recordingId,
          finalized.record,
          finalized.inputs,
        );
        await Promise.all([refreshRecordings(), refreshStorage()]);
        setStatus(
          recordingStoppedMessage(result),
          result.status === 'complete' ? 'success' : 'error',
        );
      } catch (error) {
        setStatus(
          `録音データを確定できませんでした。${errorMessage(error)}`,
          'error',
        );
      }
    },
    [refreshRecordings, refreshStorage, services.repository, setStatus],
  );

  const handleRecordingState = useCallback(
    (event: RecordingStateEvent) => {
      switch (event.type) {
        case 'started':
          dispatch({
            type: 'set-recording',
            value: {
              recordingId: event.recordingId,
              elapsedMilliseconds: 0,
              durationMilliseconds: event.durationMilliseconds,
              ratio: 0,
            },
          });
          setStatus('録音を開始しました。');
          return;
        case 'progress':
          dispatch({
            type: 'set-recording',
            value: {
              recordingId: event.recordingId,
              elapsedMilliseconds: event.elapsedMilliseconds,
              durationMilliseconds: event.durationMilliseconds,
              ratio: event.ratio,
            },
          });
          return;
        case 'stopped':
          dispatch({ type: 'set-recording', value: null });
          for (const runtime of collectorsRef.current.values()) {
            if (runtime.session.state === 'connected') {
              try {
                runtime.session.sendControl({
                  v: CONTROL_PROTOCOL_VERSION,
                  type: 'stopTestSignal',
                });
              } catch {
                // The remote source fault already marks the recording incomplete.
              }
            }
          }
          void finalizeRecording(event.result);
      }
    },
    [finalizeRecording, setStatus],
  );

  const ensureRecordingSession = useCallback(() => {
    if (recordingSessionRef.current !== null) return;
    const session = services.audioEngine.createRecordingSessionService(
      services.repository,
    );
    recordingSessionRef.current = session;
    recordingUnsubscribeRef.current =
      session.subscribeState(handleRecordingState);
  }, [handleRecordingState, services.audioEngine, services.repository]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pendingLevelsRef.current.length === 0) return;
      const points = pendingLevelsRef.current.splice(0);
      dispatch({ type: 'flush-levels', points });
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const sourceSubscriptions = sourceSubscriptionsRef.current;
    const collectors = collectorsRef.current;
    const unsubscribeDevices = services.audioEngine.subscribeDevices(
      (devices) => {
        dispatch({ type: 'set-devices', value: devices });
      },
    );
    void Promise.all([
      services.repository.loadSettings(),
      services.repository.listRecordings(),
      readMicrophonePermission(),
    ])
      .then(([settings, recordings, permission]) => {
        if (!active) return;
        settingsRef.current = settings;
        dispatch({ type: 'set-settings', value: settings });
        dispatch({ type: 'set-recordings', value: recordings });
        dispatch({ type: 'set-permission', value: permission });
        dispatch({ type: 'set-loading', value: false });
        setStatus('音声デバイスを有効化すると計測を開始できます。');
        void refreshStorage();
      })
      .catch((error: unknown) => {
        if (!active) return;
        dispatch({ type: 'set-loading', value: false });
        setStatus(
          `保存データを読み込めませんでした。${errorMessage(error)}`,
          'error',
        );
      });

    return () => {
      active = false;
      unsubscribeDevices();
      recordingUnsubscribeRef.current?.();
      for (const subscriptions of sourceSubscriptions.values()) {
        for (const unsubscribe of subscriptions) unsubscribe();
      }
      for (const collector of collectors.values()) {
        collector.unsubscribe();
        collector.session.disconnect();
      }
      void testNoiseRef.current?.stop();
      void services.audioEngine.dispose();
      void services.repository.close();
    };
  }, [refreshStorage, services, setStatus]);

  const enableAudio = useCallback(async () => {
    dispatch({ type: 'set-activation', value: 'enabling' });
    setStatus('音声デバイスを有効化しています。');
    try {
      await services.audioEngine.initialize();
      const devices = await services.audioEngine.refreshDevices();
      dispatch({ type: 'set-devices', value: devices });
      const selectedInput =
        devices.inputs.find(
          (device) =>
            `microphone:${device.id}` === settingsRef.current.primaryInputId,
        ) ?? devices.inputs[0];
      if (selectedInput === undefined) {
        throw new AudioEngineError(
          'device-not-found',
          '利用できるマイクが見つかりません。',
        );
      }
      const source = await services.audioEngine.startMicrophone(
        selectedInput.id,
      );
      attachSource(source);
      await updateDeviceSetting(source, true);
      const outputId = settingsRef.current.playbackOutputId;
      if (
        outputId !== null &&
        devices.outputs.some((device) => device.id === outputId)
      ) {
        await services.audioEngine.setPlaybackOutput(outputId);
      }
      services.audioEngine.setPlaybackGain(settingsRef.current.playbackGain);
      ensureRecordingSession();
      dispatch({
        type: 'set-permission',
        value: await readMicrophonePermission(),
      });
      dispatch({ type: 'set-activation', value: 'ready' });
      setStatus('音声デバイスを有効化しました。', 'success');
    } catch (error) {
      dispatch({
        type: 'set-permission',
        value: await readMicrophonePermission(),
      });
      dispatch({ type: 'set-activation', value: 'error' });
      setStatus(errorMessage(error), 'error');
    }
  }, [
    attachSource,
    ensureRecordingSession,
    services.audioEngine,
    setStatus,
    updateDeviceSetting,
  ]);

  const startMicrophone = useCallback(
    async (deviceId: string) => {
      try {
        const source = await services.audioEngine.startMicrophone(deviceId);
        attachSource(source);
        await updateDeviceSetting(source, true);
        setStatus(`${source.displayName}を計測入力へ追加しました。`, 'success');
      } catch (error) {
        setStatus(errorMessage(error), 'error');
      }
    },
    [attachSource, services.audioEngine, setStatus, updateDeviceSetting],
  );

  const stopSource = useCallback(
    async (sourceId: string) => {
      try {
        const source = sourcesRef.current.get(sourceId);
        if (source?.kind === 'remote') {
          throw new Error('リモート入力は設定画面から切断してください。');
        }
        await services.audioEngine.stopSource(sourceId);
        detachSource(sourceId);
        const current = settingsRef.current;
        await saveSettings({
          ...current,
          primaryInputId:
            current.primaryInputId === sourceId ? null : current.primaryInputId,
          devices: current.devices.map((device) =>
            device.id === sourceId ? { ...device, measure: false } : device,
          ),
        });
        setStatus('入力を停止しました。');
      } catch (error) {
        setStatus(errorMessage(error), 'error');
      }
    },
    [detachSource, saveSettings, services.audioEngine, setStatus],
  );

  const addSystemAudio = useCallback(async () => {
    try {
      const source = await services.audioEngine.startSystemAudio();
      attachSource(source);
      await updateDeviceSetting(source, true);
      setStatus('システム音声を計測入力へ追加しました。', 'success');
    } catch (error) {
      setStatus(errorMessage(error), 'error');
    }
  }, [attachSource, services.audioEngine, setStatus, updateDeviceSetting]);

  const selectPlaybackOutput = useCallback(
    async (deviceId: string | null) => {
      try {
        if (deviceId !== null) {
          await services.audioEngine.setPlaybackOutput(deviceId);
        }
        await saveSettings({
          ...settingsRef.current,
          playbackOutputId: deviceId,
        });
        setStatus('再生出力を更新しました。', 'success');
      } catch (error) {
        setStatus(errorMessage(error), 'error');
      }
    },
    [saveSettings, services.audioEngine, setStatus],
  );

  const setPlaybackGain = useCallback(
    async (gain: PlaybackGain) => {
      services.audioEngine.setPlaybackGain(gain);
      await saveSettings({ ...settingsRef.current, playbackGain: gain });
    },
    [saveSettings, services.audioEngine],
  );

  const startRecording = useCallback(
    async ({ direction }: StartRecordingInput) => {
      const session = recordingSessionRef.current;
      if (session === null) {
        setStatus('先に音声デバイスを有効化してください。', 'error');
        return;
      }
      const settings = settingsRef.current;
      const measuredIds = new Set(
        settings.devices
          .filter((device) => device.measure)
          .map((device) => device.id),
      );
      const sources = [...sourcesRef.current.values()].filter(
        (source) => measuredIds.has(source.id) && source.state === 'active',
      );
      try {
        if (settings.recorder.testNoise) {
          for (const runtime of collectorsRef.current.values()) {
            if (runtime.session.state === 'connected') {
              runtime.session.sendControl({
                v: CONTROL_PROTOCOL_VERSION,
                type: 'startTestSignal',
                playbackGain: settings.playbackGain,
              });
            }
          }
        }
        await session.start({
          sources,
          primaryInputId: settings.primaryInputId ?? '',
          direction,
          voice: settings.recorder.voice,
          testNoise: settings.recorder.testNoise,
          playbackGain: settings.playbackGain,
          playbackOutputId: settings.playbackOutputId,
          durationSeconds: settings.recorder.recordingDurationSeconds,
        });
      } catch (error) {
        for (const runtime of collectorsRef.current.values()) {
          if (runtime.session.state === 'connected') {
            try {
              runtime.session.sendControl({
                v: CONTROL_PROTOCOL_VERSION,
                type: 'stopTestSignal',
              });
            } catch {
              // Preserve the original start failure.
            }
          }
        }
        setStatus(errorMessage(error), 'error');
      }
    },
    [setStatus],
  );

  const stopRecording = useCallback(async () => {
    try {
      await recordingSessionRef.current?.stop();
    } catch (error) {
      setStatus(errorMessage(error), 'error');
    }
  }, [setStatus]);

  const deleteRecording = useCallback(
    async (recordingId: string) => {
      try {
        await services.repository.deleteRecording(recordingId);
        await Promise.all([refreshRecordings(), refreshStorage()]);
        setStatus('記録を削除しました。', 'success');
      } catch (error) {
        setStatus(
          `記録を削除できませんでした。${errorMessage(error)}`,
          'error',
        );
      }
    },
    [refreshRecordings, refreshStorage, services.repository, setStatus],
  );

  const downloadRecording = useCallback(
    async (recordingId: string) => {
      try {
        const recording =
          await services.repository.getRecordingWithAudio(recordingId);
        if (recording === undefined)
          throw new Error('選択した記録がありません。');
        downloadBlob(
          await createRecordingArchive(recording),
          `spector-${recordingId}.zip`,
        );
        setStatus('記録ZIPを作成しました。', 'success');
      } catch (error) {
        setStatus(
          `記録ZIPを作成できませんでした。${errorMessage(error)}`,
          'error',
        );
      }
    },
    [services.repository, setStatus],
  );

  const downloadAnalysis = useCallback(
    async (recordingIds: readonly string[], canvas: HTMLCanvasElement) => {
      try {
        const selected = (await services.repository.listRecordings()).filter(
          (record) => recordingIds.includes(record.id),
        );
        if (selected.length === 0)
          throw new Error('解析対象を選択してください。');
        const chartPng = await canvasToPng(canvas);
        const archive = await createAnalysisArchive({
          markdown: createAnalysisMarkdown(selected),
          chartPng,
          baseName: 'spector-analysis',
        });
        downloadBlob(archive, 'spector-analysis.zip');
        setStatus('解析ZIPを作成しました。', 'success');
      } catch (error) {
        setStatus(
          `解析ZIPを作成できませんでした。${errorMessage(error)}`,
          'error',
        );
      }
    },
    [services.repository, setStatus],
  );

  const startTestNoise = useCallback(async () => {
    try {
      if (settingsRef.current.playbackOutputId === null) {
        throw new Error('再生出力を選択してください。');
      }
      testNoiseRef.current ??= services.audioEngine.createTestNoisePlayback();
      await testNoiseRef.current.start(settingsRef.current.playbackGain);
      setStatus('試験音を再生しています。');
    } catch (error) {
      setStatus(errorMessage(error), 'error');
      throw error;
    }
  }, [services.audioEngine, setStatus]);

  const stopTestNoise = useCallback(async () => {
    try {
      await testNoiseRef.current?.stop();
      setStatus('試験音を停止しました。');
    } catch (error) {
      setStatus(errorMessage(error), 'error');
      throw error;
    }
  }, [setStatus]);

  const requestPersistentStorage = useCallback(async () => {
    try {
      if (navigator.storage?.persist === undefined) {
        throw new Error('このブラウザーは永続ストレージに対応していません。');
      }
      const persisted = await navigator.storage.persist();
      await refreshStorage();
      setStatus(
        persisted
          ? '永続ストレージが許可されました。'
          : '永続ストレージは許可されませんでした。',
        persisted ? 'success' : 'info',
      );
    } catch (error) {
      setStatus(errorMessage(error), 'error');
    }
  }, [refreshStorage, setStatus]);

  const exportBackup = useCallback(async () => {
    try {
      downloadBlob(
        await createWebBackupArchive(services.repository),
        'spector-backup.zip',
      );
      setStatus('バックアップZIPを作成しました。', 'success');
    } catch (error) {
      setStatus(
        `バックアップを作成できませんでした。${errorMessage(error)}`,
        'error',
      );
    }
  }, [services.repository, setStatus]);

  const importBackup = useCallback(
    async (file: File) => {
      try {
        const result = await restoreWebBackupArchive(services.repository, file);
        const settings = await services.repository.loadSettings();
        settingsRef.current = settings;
        dispatch({ type: 'set-settings', value: settings });
        await Promise.all([refreshRecordings(), refreshStorage()]);
        setStatus(
          `バックアップを復元しました。記録${result.recordings}件、音声${result.audioFiles}件です。`,
          'success',
        );
      } catch (error) {
        setStatus(`バックアップZIPが不正です。${errorMessage(error)}`, 'error');
      }
    },
    [refreshRecordings, refreshStorage, services.repository, setStatus],
  );

  const importLegacy = useCallback(
    async (file: File) => {
      try {
        const result = await importLegacyWpfArchive(services.repository, file);
        const settings = await services.repository.loadSettings();
        settingsRef.current = settings;
        dispatch({ type: 'set-settings', value: settings });
        await Promise.all([refreshRecordings(), refreshStorage()]);
        setStatus(
          `旧WPFデータを取り込みました。新規${result.imported}件、重複${result.skipped}件です。`,
          'success',
        );
      } catch (error) {
        setStatus(`旧WPF ZIPが不正です。${errorMessage(error)}`, 'error');
      }
    },
    [refreshRecordings, refreshStorage, services.repository, setStatus],
  );

  const remoteView = useCallback(
    (
      runtime: CollectorRuntime,
      stateOverride = runtime.session.state,
      reason: string | null = null,
    ): RemoteCollectorView => ({
      peerId: runtime.session.peerId,
      displayName: runtime.session.displayName,
      state: stateOverride,
      reason,
      offer: runtime.offer,
    }),
    [],
  );

  const createRemoteOffer = useCallback(async () => {
    const session = services.createCollectorSession();
    const runtime = {
      session,
      offer: '',
      unsubscribe: () => undefined,
    } as CollectorRuntime;
    runtime.unsubscribe = session.subscribeState((event) => {
      dispatch({
        type: 'upsert-remote',
        value: remoteView(runtime, event.state, event.reason),
      });
      if (event.state === 'connected' && session.source !== null) {
        attachSource(session.source);
        void updateDeviceSetting(session.source, true);
        setStatus(`${session.displayName}が接続されました。`, 'success');
      } else if (event.state === 'disconnected') {
        setStatus(event.reason ?? 'リモート端末が切断されました。', 'error');
      }
    });
    collectorsRef.current.set(session.peerId, runtime);
    dispatch({ type: 'upsert-remote', value: remoteView(runtime) });
    try {
      runtime.offer = await session.createOffer();
      dispatch({ type: 'upsert-remote', value: remoteView(runtime) });
      setStatus(
        '接続offerを作成しました。端末側へコピーしてください。',
        'success',
      );
    } catch (error) {
      setStatus(`offerを作成できませんでした。${errorMessage(error)}`, 'error');
    }
  }, [attachSource, remoteView, services, setStatus, updateDeviceSetting]);

  const acceptRemoteAnswer = useCallback(
    async (peerId: string, answer: string) => {
      const runtime = collectorsRef.current.get(peerId);
      if (runtime === undefined) return;
      try {
        await runtime.session.acceptAnswer(answer);
        setStatus(
          'answerを適用しました。端末の接続を待っています。',
          'success',
        );
      } catch (error) {
        setStatus(
          `answerを適用できませんでした。${errorMessage(error)}`,
          'error',
        );
      }
    },
    [setStatus],
  );

  const disconnectRemote = useCallback(
    (peerId: string) => {
      const runtime = collectorsRef.current.get(peerId);
      if (runtime === undefined) return;
      runtime.session.disconnect();
      runtime.unsubscribe();
      if (runtime.session.source !== null)
        detachSource(runtime.session.source.id);
      collectorsRef.current.delete(peerId);
      dispatch({ type: 'remove-remote', peerId });
      setStatus('リモート端末を切断しました。');
    },
    [detachSource, setStatus],
  );

  const actions = useMemo<SpectorActions>(
    () => ({
      selectTab: (tab) => dispatch({ type: 'select-tab', tab }),
      enableAudio,
      startMicrophone,
      stopSource,
      addSystemAudio,
      saveSettings,
      selectPlaybackOutput,
      setPlaybackGain,
      startRecording,
      stopRecording,
      deleteRecording,
      downloadRecording,
      downloadAnalysis,
      startTestNoise,
      stopTestNoise,
      refreshStorage,
      requestPersistentStorage,
      exportBackup,
      importBackup,
      importLegacy,
      createRemoteOffer,
      acceptRemoteAnswer,
      disconnectRemote,
    }),
    [
      acceptRemoteAnswer,
      addSystemAudio,
      createRemoteOffer,
      deleteRecording,
      disconnectRemote,
      downloadAnalysis,
      downloadRecording,
      enableAudio,
      exportBackup,
      importBackup,
      importLegacy,
      refreshStorage,
      requestPersistentStorage,
      saveSettings,
      selectPlaybackOutput,
      setPlaybackGain,
      startMicrophone,
      startRecording,
      startTestNoise,
      stopRecording,
      stopSource,
      stopTestNoise,
    ],
  );

  return (
    <SpectorContext.Provider value={{ state, actions }}>
      {children}
    </SpectorContext.Provider>
  );
}

export const useSpector = (): SpectorContextValue => {
  const value = useContext(SpectorContext);
  if (value === null) throw new Error('SpectorProviderがありません。');
  return value;
};
