import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@billbull/shared/index.css';
import api from '@billbull/shared/api/axiosConfig';
import { installGlobalClientLogging } from '@billbull/shared/utils/clientLogger';
import { installOfflineAdapter } from '@billbull/shared/pages/Sales/POS/offline/offlineAdapter';
import { installOfflineRuntime } from '@billbull/shared/pages/Sales/POS/offline/offlineRuntime';
import { installTillKeyGuard } from './shell/SessionLock';
import PosApp from './PosApp';

installGlobalClientLogging();
// Before the first render, so it precedes every window-level POS key listener.
installTillKeyGuard();

// M3 offline MVP: standalone till only (the embedded Retail POS never installs any of this).
installOfflineAdapter(api);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch((err) => console.warn('POS service worker registration failed', err));
}

const render = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PosApp />
  </StrictMode>,
);

// Load the offline state (lease, catalogue, outbox) before the first render, but never let a slow
// or broken IndexedDB hold the till back: render after at most 2 s either way.
Promise.race([
  installOfflineRuntime({ apiInstance: api }).catch((err) => console.warn('Offline runtime failed to start', err)),
  new Promise((resolve) => setTimeout(resolve, 2000)),
]).finally(render);
