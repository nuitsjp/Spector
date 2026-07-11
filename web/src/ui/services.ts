import { BrowserAudioEngine } from '../audio';
import {
  createRemoteCollectorSession,
  type RemoteCollectorSession,
} from '../remote';
import { StorageQuotaService, StorageRepository } from '../storage';

export interface SpectorServices {
  readonly audioEngine: BrowserAudioEngine;
  readonly repository: StorageRepository;
  readonly quota: StorageQuotaService;
  readonly createCollectorSession: () => RemoteCollectorSession;
}

export const createSpectorServices = (): SpectorServices => ({
  audioEngine: new BrowserAudioEngine(),
  repository: new StorageRepository(),
  quota: new StorageQuotaService(),
  createCollectorSession: () => createRemoteCollectorSession(),
});
