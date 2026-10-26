import './styles.css';
import { BrowserRuntimeBridge } from './bridge/browserBridge';
import { activeGame } from './games/catalog';
import { startAuthoredGame } from './games/host';

const bridgeUrl = new URL('/runtime-bridge', window.location.href);
bridgeUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

void startAuthoredGame(activeGame).then((runtime) => new BrowserRuntimeBridge(runtime, {
  url: bridgeUrl.href,
  onStatus: (message) => console.info(`[runtime bridge] ${message}`),
}).connect()).catch((error: unknown) => console.error('Game initialization failed:', error));
