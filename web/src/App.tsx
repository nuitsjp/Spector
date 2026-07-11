import { useEffect, useMemo, useState } from 'react';

import { MainApplication } from './ui/MainApplication';
import { RemoteTerminalPage } from './ui/RemoteTerminalPage';
import { SpectorProvider } from './ui/SpectorContext';
import { createSpectorServices, type SpectorServices } from './ui/services';

export interface AppProps {
  readonly services?: SpectorServices;
}

export function App({ services: providedServices }: AppProps) {
  const [remoteMode, setRemoteMode] = useState(
    () => window.location.hash.toLocaleLowerCase('en-US') === '#remote',
  );
  const services = useMemo(
    () => providedServices ?? createSpectorServices(),
    [providedServices],
  );

  useEffect(() => {
    const onHashChange = (): void => {
      setRemoteMode(
        window.location.hash.toLocaleLowerCase('en-US') === '#remote',
      );
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (remoteMode) {
    return (
      <RemoteTerminalPage
        audioEngine={services.audioEngine}
        closeStorage={() => services.repository.close()}
      />
    );
  }

  return (
    <SpectorProvider services={services}>
      <MainApplication />
    </SpectorProvider>
  );
}
