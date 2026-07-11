import { BrowserAudioEngine } from './browserAudioEngine';

/** Shared browser service. Construction is side-effect free; initialize requires a user gesture. */
export const browserAudioEngine = new BrowserAudioEngine();

window.addEventListener('pagehide', () => {
  void browserAudioEngine.dispose();
});
