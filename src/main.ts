import './styles.css';
import { BrowserRuntimeBridge } from './bridge/browserBridge';
import { activeGame } from './games/catalog';
import { startAuthoredGame } from './games/host';

const runtime = startAuthoredGame(activeGame);
const bridgeUrl = import.meta.env.VITE_RUNTIME_WS_URL ?? `ws://${window.location.hostname || '127.0.0.1'}:8787`;

new BrowserRuntimeBridge(runtime, {
  url: bridgeUrl,
  onStatus: (message) => console.info(`[runtime bridge] ${message}`),
}).connect();
