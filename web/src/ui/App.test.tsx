import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import {
  AudioEngineError,
  type AudioDeviceSnapshot,
  type BrowserAudioEngine,
  type RecordingSessionResult,
  type RecordingSessionService,
  type RecordingStartOptions,
  type RecordingStateEvent,
} from '../audio';
import type { AudioSource, Unsubscribe } from '../contracts';
import { createSignalLevelDbfs, type RecordingRecord } from '../domain';
import {
  createDefaultSettings,
  type StorageQuotaService,
  type StorageRepository,
} from '../storage';

import type { SpectorServices } from './services';

const devices: AudioDeviceSnapshot = {
  inputs: [{ id: 'mic-1', label: 'テストマイク', kind: 'audioinput' }],
  outputs: [
    { id: 'speaker-1', label: 'テストスピーカー', kind: 'audiooutput' },
  ],
};

const source: AudioSource = {
  id: 'microphone:mic-1',
  displayName: 'テストマイク',
  kind: 'microphone',
  format: { sampleRate: 48_000, channels: 1 },
  state: 'active',
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  subscribeLevel: () => () => undefined,
  subscribePcm: () => () => undefined,
  subscribeDisconnected: () => () => undefined,
};

interface FakeServicesResult {
  readonly services: SpectorServices;
  readonly initialize: ReturnType<typeof vi.fn>;
  readonly sessionStart: ReturnType<typeof vi.fn>;
  readonly finalizeRecording: ReturnType<typeof vi.fn>;
}

const createFakeServices = (permissionDenied = false): FakeServicesResult => {
  let recordingListener: ((event: RecordingStateEvent) => void) | null = null;
  let startOptions: RecordingStartOptions | null = null;
  const records: RecordingRecord[] = [];
  const settings = createDefaultSettings();
  const sessionStart = vi.fn(async (options: RecordingStartOptions) => {
    startOptions = options;
    recordingListener?.({
      type: 'started',
      recordingId: 'recording-1',
      durationMilliseconds: options.durationSeconds * 1_000,
    });
    return 'recording-1';
  });
  const sessionStop = vi.fn(async (): Promise<RecordingSessionResult> => {
    if (startOptions === null) throw new Error('録音が開始されていません。');
    const options = startOptions as RecordingStartOptions;
    const result: RecordingSessionResult = {
      recordingId: 'recording-1',
      status: 'complete',
      reason: 'manual',
      detail: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      endedAt: '2026-07-11T00:00:01.000Z',
      primaryInputId: options.primaryInputId,
      direction: options.direction,
      voice: options.voice,
      testNoise: options.testNoise,
      playbackGain: options.playbackGain,
      inputs: [
        {
          inputId: source.id,
          displayName: source.displayName,
          sampleRate: 48_000,
          channels: 1,
          levels: [createSignalLevelDbfs(-42), createSignalLevelDbfs(-38)],
        },
      ],
    };
    recordingListener?.({ type: 'stopped', result });
    return result;
  });
  const session = {
    get isRecording() {
      return startOptions !== null;
    },
    subscribeState(
      listener: (event: RecordingStateEvent) => void,
    ): Unsubscribe {
      recordingListener = listener;
      return () => {
        recordingListener = null;
      };
    },
    start: sessionStart,
    stop: sessionStop,
  } as unknown as RecordingSessionService;
  const initialize = vi.fn(async () => undefined);
  const finalizeRecording = vi.fn(
    async (_sessionId: string, record: RecordingRecord): Promise<void> => {
      records.unshift(record);
    },
  );
  const repository = {
    loadSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async () => undefined),
    listRecordings: vi.fn(async () => [...records]),
    finalizeRecording,
    deleteRecording: vi.fn(async (id: string) => {
      const index = records.findIndex((record) => record.id === id);
      if (index >= 0) records.splice(index, 1);
    }),
    getRecordingWithAudio: vi.fn(async () => undefined),
    snapshot: vi.fn(async () => ({ settings, recordings: [] })),
    replaceWithSnapshot: vi.fn(async () => undefined),
    commitLegacyImport: vi.fn(async () => ({
      imported: 0,
      skipped: 0,
      recordingIds: [],
    })),
    close: vi.fn(async () => undefined),
  } as unknown as StorageRepository;
  const audioEngine = {
    subscribeDevices: vi.fn(() => () => undefined),
    initialize,
    refreshDevices: vi.fn(async () => devices),
    startMicrophone: permissionDenied
      ? vi.fn(async () => {
          throw new AudioEngineError(
            'permission-denied',
            'マイクの利用が許可されませんでした。',
          );
        })
      : vi.fn(async () => source),
    setPlaybackOutput: vi.fn(async () => undefined),
    setPlaybackGain: vi.fn(),
    createRecordingSessionService: vi.fn(() => session),
    stopSource: vi.fn(async () => undefined),
    startSystemAudio: vi.fn(async () => source),
    createTestNoisePlayback: vi.fn(() => ({
      isPlaying: false,
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    })),
    dispose: vi.fn(async () => undefined),
  } as unknown as BrowserAudioEngine;
  const quota = {
    estimate: vi.fn(async () => ({
      quota: 1_000_000,
      usage: 100,
      available: 999_900,
    })),
  } as unknown as StorageQuotaService;

  return {
    services: {
      audioEngine,
      repository,
      quota,
      createCollectorSession: () => {
        throw new Error('このテストではWebRTCを開始しません。');
      },
    },
    initialize,
    sessionStart,
    finalizeRecording,
  };
};

beforeEach(() => {
  class SupportedAudioContext {
    setSinkId(): Promise<void> {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('AudioContext', SupportedAudioContext);
  vi.stubGlobal('AudioWorkletNode', class AudioWorkletNode {});
  vi.stubGlobal('RTCPeerConnection', class RTCPeerConnection {});
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
      getDisplayMedia: vi.fn(),
    },
  });
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({ quota: 1_000_000, usage: 100 })),
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => true),
    },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: undefined,
  });
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Spector App', () => {
  it('ユーザー操作前は権限要求せず、有効化後にキーボードで4タブを移動できる', async () => {
    const user = userEvent.setup();
    const fake = createFakeServices();
    render(<App services={fake.services} />);

    const enable = await screen.findByRole('button', {
      name: '音声デバイスを有効化',
    });
    expect(fake.initialize).not.toHaveBeenCalled();
    await user.click(enable);

    const measureTab = await screen.findByRole('tab', { name: '計測' });
    expect(fake.initialize).toHaveBeenCalledTimes(1);
    expect(measureTab).toHaveAttribute('aria-selected', 'true');

    measureTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '解析' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('録音が完了すると、ここで統計とWAVを確認できます。'),
    ).toBeVisible();
  });

  it('権限拒否を日本語のalertとして表示する', async () => {
    const user = userEvent.setup();
    const fake = createFakeServices(true);
    render(<App services={fake.services} />);

    await user.click(
      await screen.findByRole('button', { name: '音声デバイスを有効化' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'マイクの利用が許可されませんでした。',
    );
  });

  it('録音停止結果を統計化してStorageRepositoryへ確定する', async () => {
    const user = userEvent.setup();
    const fake = createFakeServices();
    render(<App services={fake.services} />);
    await user.click(
      await screen.findByRole('button', { name: '音声デバイスを有効化' }),
    );

    await user.click(await screen.findByRole('button', { name: '録音を開始' }));
    expect(
      await screen.findByRole('progressbar', { name: '録音進捗' }),
    ).toBeVisible();
    expect(fake.sessionStart).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryInputId: 'microphone:mic-1',
        sources: [source],
      }),
    );

    await user.click(screen.getByRole('button', { name: '録音を停止' }));
    await waitFor(() =>
      expect(fake.finalizeRecording).toHaveBeenCalledTimes(1),
    );
    expect(fake.finalizeRecording).toHaveBeenCalledWith(
      'recording-1',
      expect.objectContaining({
        status: 'complete',
        deviceRecordings: [
          expect.objectContaining({ min: -42, avg: -40, max: -38 }),
        ],
      }),
      [
        {
          inputId: 'microphone:mic-1',
          wavBlobKey: 'recording-1/1.wav',
          sampleRate: 48_000,
          channels: 1,
        },
      ],
    );
  });
});
