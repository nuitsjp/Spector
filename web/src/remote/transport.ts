export const CONTROL_DATA_CHANNEL_LABEL = 'control-v1';
export const PCM_DATA_CHANNEL_LABEL = 'pcm-v1';

export interface RtcDataChannelLike extends EventTarget {
  readonly label: string;
  readonly ordered: boolean;
  readonly maxPacketLifeTime: number | null;
  readonly maxRetransmits: number | null;
  readonly readyState: RTCDataChannelState;
  binaryType: BinaryType;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export interface RtcPeerConnectionLike extends EventTarget {
  readonly localDescription: RTCSessionDescriptionInit | null;
  readonly iceGatheringState: RTCIceGatheringState;
  readonly connectionState: RTCPeerConnectionState;
  createDataChannel(
    label: string,
    dataChannelDict?: RTCDataChannelInit,
  ): RtcDataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
}

export type RtcPeerConnectionFactory = (
  configuration: RTCConfiguration,
) => RtcPeerConnectionLike;

export const createBrowserPeerConnection: RtcPeerConnectionFactory = (
  configuration,
) => {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not available in this browser.');
  }

  return new RTCPeerConnection(
    configuration,
  ) as unknown as RtcPeerConnectionLike;
};

export const assertManualSdp = (
  sdp: string,
  kind: 'offer' | 'answer',
): void => {
  if (sdp.trim().length === 0) {
    throw new Error(`${kind} SDP must not be empty.`);
  }
};

export const waitForIceGatheringComplete = async (
  peerConnection: RtcPeerConnectionLike,
): Promise<void> => {
  if (peerConnection.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      peerConnection.removeEventListener(
        'icegatheringstatechange',
        handleIceGatheringStateChange,
      );
      peerConnection.removeEventListener(
        'connectionstatechange',
        handleConnectionStateChange,
      );
    };

    const handleIceGatheringStateChange = (): void => {
      if (peerConnection.iceGatheringState !== 'complete') {
        return;
      }

      cleanup();
      resolve();
    };

    const handleConnectionStateChange = (): void => {
      if (
        peerConnection.connectionState !== 'closed' &&
        peerConnection.connectionState !== 'failed'
      ) {
        return;
      }

      cleanup();
      reject(
        new Error(
          `WebRTC connection ended while gathering ICE candidates (${peerConnection.connectionState}).`,
        ),
      );
    };

    peerConnection.addEventListener(
      'icegatheringstatechange',
      handleIceGatheringStateChange,
    );
    peerConnection.addEventListener(
      'connectionstatechange',
      handleConnectionStateChange,
    );
  });
};

export const getGatheredLocalSdp = async (
  peerConnection: RtcPeerConnectionLike,
): Promise<string> => {
  await waitForIceGatheringComplete(peerConnection);
  const sdp = peerConnection.localDescription?.sdp;

  if (sdp === undefined || sdp.trim().length === 0) {
    throw new Error('ICE gathering completed without a local SDP.');
  }

  return sdp;
};

export const assertReliableOrderedChannel = (
  channel: RtcDataChannelLike,
): void => {
  if (
    !channel.ordered ||
    channel.maxPacketLifeTime !== null ||
    channel.maxRetransmits !== null
  ) {
    throw new Error(
      `Data channel ${channel.label} must be ordered and reliable.`,
    );
  }
};
