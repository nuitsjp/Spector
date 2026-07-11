import {
  AWeightingFilter,
  calculateRms,
  rmsToSignalLevelDbfs,
} from '../../domain/dsp';

import { CaptureWindowAccumulator, interleaveChannels } from './captureFrames';

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

const PROCESSOR_NAME = 'spector-capture';

class SpectorCaptureProcessor extends AudioWorkletProcessor {
  private readonly accumulator = new CaptureWindowAccumulator(sampleRate);
  private readonly filter = new AWeightingFilter(sampleRate);

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (input !== undefined && input.length > 0) {
      try {
        const windows = this.accumulator.append(input, currentTime * 1_000);
        for (const window of windows) {
          const interleaved = interleaveChannels(window.channelData);
          const weighted = this.filter.process(interleaved);
          const level = rmsToSignalLevelDbfs(calculateRms(weighted));
          const buffers = window.channelData.map((channel) => channel.buffer);

          this.port.postMessage(
            {
              type: 'capture-window',
              sampleRate: window.sampleRate,
              timestamp: window.timestamp,
              level,
              channelBuffers: buffers,
            },
            buffers,
          );
        }
      } catch (error) {
        this.port.postMessage({
          type: 'capture-error',
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, SpectorCaptureProcessor);

export {};
