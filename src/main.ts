import './styles.css';

const params = new URLSearchParams(location.search);
const start = async () => {
  if (params.has('studioGame')) { const { startPlayer } = await import('./studio/player'); await startPlayer(); }
  else if (params.has('game') || params.has('session') || params.has('stopped')) { document.body.className = 'player-page'; await import('./runtimePage'); }
  else { const { startStudio } = await import('./studio/app'); await startStudio(); }
};
void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.textContent = `LoreCraft could not start: ${message}. Reload to try again.`;
  if (window.parent !== window) window.parent.postMessage({ source: 'lorecraft-player', type: 'error', data: message }, location.origin);
});
