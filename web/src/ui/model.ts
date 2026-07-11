import type { AudioSource } from '../contracts';
import type {
  RecordingRecord,
  SignalLevelDbfs,
  SpectorSettings,
} from '../domain';
import type { AudioDeviceSnapshot } from '../audio';

export type MainTab = 'measure' | 'analysis' | 'calibration' | 'settings';

export type AudioActivationState =
  'idle' | 'enabling' | 'ready' | 'unsupported' | 'error';

export interface BrowserCapability {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  readonly required: boolean;
}

export interface LevelPoint {
  readonly sourceId: string;
  readonly timestamp: number;
  readonly level: SignalLevelDbfs;
}

export interface RecordingProgress {
  readonly recordingId: string;
  readonly elapsedMilliseconds: number;
  readonly durationMilliseconds: number;
  readonly ratio: number;
}

export interface StorageView {
  readonly quota: number | null;
  readonly usage: number | null;
  readonly available: number | null;
  readonly persisted: boolean | null;
}

export interface RemoteCollectorView {
  readonly peerId: string;
  readonly displayName: string;
  readonly state: 'connecting' | 'connected' | 'disconnected';
  readonly reason: string | null;
  readonly offer: string;
}

export interface AppState {
  readonly selectedTab: MainTab;
  readonly capabilities: readonly BrowserCapability[];
  readonly activation: AudioActivationState;
  readonly microphonePermission: PermissionState | 'unknown' | 'unsupported';
  readonly devices: AudioDeviceSnapshot;
  readonly sources: readonly AudioSource[];
  readonly levels: Readonly<Record<string, readonly LevelPoint[]>>;
  readonly settings: SpectorSettings;
  readonly recordings: readonly RecordingRecord[];
  readonly loading: boolean;
  readonly recording: RecordingProgress | null;
  readonly storage: StorageView;
  readonly remotes: readonly RemoteCollectorView[];
  readonly statusMessage: string;
  readonly statusTone: 'info' | 'success' | 'error';
}

export type AppAction =
  | { readonly type: 'select-tab'; readonly tab: MainTab }
  | { readonly type: 'set-activation'; readonly value: AudioActivationState }
  | {
      readonly type: 'set-permission';
      readonly value: AppState['microphonePermission'];
    }
  | { readonly type: 'set-devices'; readonly value: AudioDeviceSnapshot }
  | { readonly type: 'upsert-source'; readonly source: AudioSource }
  | { readonly type: 'remove-source'; readonly sourceId: string }
  | { readonly type: 'flush-levels'; readonly points: readonly LevelPoint[] }
  | { readonly type: 'set-settings'; readonly value: SpectorSettings }
  | {
      readonly type: 'set-recordings';
      readonly value: readonly RecordingRecord[];
    }
  | { readonly type: 'set-loading'; readonly value: boolean }
  | {
      readonly type: 'set-recording';
      readonly value: RecordingProgress | null;
    }
  | { readonly type: 'set-storage'; readonly value: StorageView }
  | { readonly type: 'upsert-remote'; readonly value: RemoteCollectorView }
  | { readonly type: 'remove-remote'; readonly peerId: string }
  | {
      readonly type: 'status';
      readonly message: string;
      readonly tone?: AppState['statusTone'];
    };

const mergeLevelPoints = (
  current: AppState['levels'],
  points: readonly LevelPoint[],
): AppState['levels'] => {
  if (points.length === 0) return current;
  const next: Record<string, readonly LevelPoint[]> = { ...current };
  const sourceIds = new Set(points.map((point) => point.sourceId));

  for (const sourceId of sourceIds) {
    const additions = points.filter((point) => point.sourceId === sourceId);
    const newest = additions.at(-1)?.timestamp;
    if (newest === undefined) continue;
    const cutoff = newest - 20_000;
    next[sourceId] = [...(current[sourceId] ?? []), ...additions].filter(
      (point) => point.timestamp >= cutoff,
    );
  }
  return next;
};

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'select-tab':
      return { ...state, selectedTab: action.tab };
    case 'set-activation':
      return { ...state, activation: action.value };
    case 'set-permission':
      return { ...state, microphonePermission: action.value };
    case 'set-devices':
      return { ...state, devices: action.value };
    case 'upsert-source':
      return {
        ...state,
        sources: [
          ...state.sources.filter((source) => source.id !== action.source.id),
          action.source,
        ],
      };
    case 'remove-source':
      return {
        ...state,
        sources: state.sources.filter(
          (source) => source.id !== action.sourceId,
        ),
      };
    case 'flush-levels':
      return {
        ...state,
        levels: mergeLevelPoints(state.levels, action.points),
      };
    case 'set-settings':
      return { ...state, settings: action.value };
    case 'set-recordings':
      return { ...state, recordings: action.value };
    case 'set-loading':
      return { ...state, loading: action.value };
    case 'set-recording':
      return { ...state, recording: action.value };
    case 'set-storage':
      return { ...state, storage: action.value };
    case 'upsert-remote':
      return {
        ...state,
        remotes: [
          ...state.remotes.filter(
            (remote) => remote.peerId !== action.value.peerId,
          ),
          action.value,
        ],
      };
    case 'remove-remote':
      return {
        ...state,
        remotes: state.remotes.filter(
          (remote) => remote.peerId !== action.peerId,
        ),
      };
    case 'status':
      return {
        ...state,
        statusMessage: action.message,
        statusTone: action.tone ?? 'info',
      };
  }
};
