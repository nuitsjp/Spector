import type { BrowserCapability } from './model';

export const inspectBrowserCapabilities = (): readonly BrowserCapability[] => {
  const mediaDevices = navigator.mediaDevices;
  const audioContextAvailable = typeof AudioContext !== 'undefined';

  return [
    {
      id: 'secure-context',
      label: 'HTTPS（安全なコンテキスト）',
      available: window.isSecureContext,
      required: true,
    },
    {
      id: 'web-audio',
      label: 'Web Audio API',
      available: audioContextAvailable,
      required: true,
    },
    {
      id: 'audio-worklet',
      label: 'AudioWorklet',
      available:
        audioContextAvailable && typeof AudioWorkletNode !== 'undefined',
      required: true,
    },
    {
      id: 'microphone',
      label: 'マイク取得',
      available: typeof mediaDevices?.getUserMedia === 'function',
      required: true,
    },
    {
      id: 'indexed-db',
      label: 'IndexedDB',
      available: typeof indexedDB !== 'undefined',
      required: true,
    },
    {
      id: 'system-audio',
      label: 'システム音声共有',
      available: typeof mediaDevices?.getDisplayMedia === 'function',
      required: false,
    },
    {
      id: 'output-selection',
      label: '再生出力先の選択',
      available: audioContextAvailable && 'setSinkId' in AudioContext.prototype,
      required: false,
    },
    {
      id: 'webrtc',
      label: 'WebRTC端末接続',
      available: typeof RTCPeerConnection !== 'undefined',
      required: false,
    },
    {
      id: 'persistent-storage',
      label: '永続ストレージ',
      available: typeof navigator.storage?.persist === 'function',
      required: false,
    },
  ];
};

export const hasRequiredBrowserCapabilities = (
  capabilities: readonly BrowserCapability[],
): boolean =>
  capabilities.every(
    (capability) => !capability.required || capability.available,
  );

export const readMicrophonePermission = async (): Promise<
  PermissionState | 'unknown' | 'unsupported'
> => {
  if (navigator.permissions?.query === undefined) return 'unsupported';
  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return status.state;
  } catch {
    return 'unknown';
  }
};
