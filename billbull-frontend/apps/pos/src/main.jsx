import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@billbull/shared/index.css';
import { installGlobalClientLogging } from '@billbull/shared/utils/clientLogger';
import { installTillKeyGuard } from './shell/SessionLock';
import PosApp from './PosApp';

installGlobalClientLogging();
// Before the first render, so it precedes every window-level POS key listener.
installTillKeyGuard();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PosApp />
  </StrictMode>,
);
