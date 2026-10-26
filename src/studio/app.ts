import { compilePrompt, examples, gameSpecSchema, parseProject } from './spec';
import type { Project, Revision, GameSpec } from './spec';
import { playtest } from './playtest';
import { exportHtml } from './export';
import { deleteProject, newProject, readCheckpoint, readProjects, saveCheckpoint, saveProject } from './storage';
import type { WorldState } from './engine';

const paths: Record<string, string> = {
  spark: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>', code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  leaf: '<path d="M20 3C5 2 1 12 7 17s15 0 13-14ZM4 21 16 9"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const genreNames = { adventure: 'Adventure', shooter: 'Arcade shooter', survival: 'Survival', runner: 'Endless runner' };
const themeNames = { forest: 'Moonlit forest', space: 'Deep space', dungeon: 'Ancient dungeon', ocean: 'Under the sea', neon: 'Neon city' };
const uuid = () => crypto.randomUUID();
const download = (name: string, data: Blob | string, type = 'application/json') => {
  const url = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function startStudio(): Promise<void> {
  let project: Project;
  let library: Project[] = [];
  let storageError = '';
  try { library = readProjects(); } catch (error) { storageError = error instanceof Error ? error.message : 'Browser storage is unavailable.'; }
  const initialSpec = compilePrompt(examples[0].prompt);
  const first: Revision = { id: uuid(), prompt: examples[0].prompt, spec: initialSpec, source: 'local', createdAt: new Date().toISOString(), checks: playtest(initialSpec) };
  project = library[0] ?? newProject(first);
  let revision = project.revisions.find((r) => r.id === project.activeRevisionId)!;
  let tab = 'overview', generating = false, ready = false, paused = true, muted = true, aiAvailable = false;
  let generationMode: 'local' | 'ai' = 'local';
  let selectedEntity = 'player-1';
  let snapshot: WorldState | undefined;
  let entities: { id: string; type: string; position: { x: number; y: number }; size: { x: number; y: number }; properties: { speed: number } }[] = [];
  let logs: { level: string; message: string; timestamp: string }[] = [];
  let audio: AudioContext | undefined;
  let lastScore = 0, lastHealth = revision.spec.lives;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  document.body.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="LoreCraft home"><span class="brand-symbol">${icon('spark')}</span><span>Lore<span class="brand-light">Craft</span></span><span class="beta">BETA</span></a>
      <button class="new-world" data-action="new">${icon('plus')} New world <span>⌘ K</span></button>
      <div class="nav-label">YOUR STUDIO</div>
      <nav aria-label="Main navigation"><button class="nav-item active" data-action="workspace">${icon('grid')} Workspace <span class="nav-dot"></span></button><button class="nav-item" data-action="projects">${icon('folder')} My projects <span id="project-count">0</span></button><button class="nav-item" data-action="history">${icon('clock')} Version history</button></nav>
      <div class="sidebar-divider"></div><div class="nav-label">A LITTLE INSPIRATION</div>
      <div class="inspiration">${examples.slice(0, 3).map((example, i) => `<button data-action="example" data-index="${i}"><span class="tiny-world theme-${example.theme}">${['✦', '✧', '♜'][i]}</span><span>${example.title}<small>${example.label}</small></span>${icon('arrow')}</button>`).join('')}</div>
      <div class="sidebar-bottom"><div class="studio-note">${icon('leaf')}<span>Big worlds.<br>A little imagination.</span></div><button class="nav-item" data-action="help">${icon('help')} How it works</button><button class="profile" data-action="settings"><span class="avatar">LC</span><span>Creator workspace<small>Saved on this device</small></span>${icon('settings')}</button></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><button class="icon-button mobile-menu" data-action="menu" aria-label="Open studio navigation">${icon('grid')}</button><div class="breadcrumb"><span>Workspace</span><span class="slash">/</span><span id="breadcrumb-title"></span></div><div class="top-actions"><span class="save-status" id="save-status"><i></i> Saved locally</span><button class="button quiet" data-action="save">${icon('save')}<span>Save project</span></button><button class="button export-button" data-action="export">${icon('download')} Export game</button></div></header>
      <main class="workspace">
        <section class="author-panel" aria-label="Game authoring">
          <div class="eyebrow"><span class="little-star">✦</span> YOUR IMAGINATION, PLAYABLE</div>
          <h1>A little lore.<br> A whole <em>world.</em></h1>
          <p class="intro">Dream up something worth playing.<br> We’ll help you bring it to life.</p>
          <form id="prompt-form"><label class="prompt-label" for="prompt">What would you like to create?</label><div class="prompt-box"><textarea id="prompt" maxlength="4000" placeholder="A tiny explorer in an enchanted forest, collecting crystals under the moonlight…" required minlength="3"></textarea><div class="prompt-bottom"><span>${icon('spark')} <select id="generation-mode" aria-label="Generation mode"><option value="local">Local generation</option><option value="ai" disabled>AI · connect a key</option></select></span><span id="prompt-count">0 / 4000</span></div><button class="generate-button" type="submit" id="generate">${icon('spark')} Create my game ${icon('arrow')}</button></div></form>
          <div class="try-row"><span>Or start with a spark</span></div><div class="prompt-chips">${examples.map((e, i) => `<button data-action="example" data-index="${i}">${['☘', '✧', '♜', '≈'][i]} ${e.label}</button>`).join('')}</div>
          <div id="generation-progress" hidden aria-live="polite"></div>
          <div class="build-note" id="build-note"></div>
          <div class="author-footer"><span class="mini-orbit">✧</span><span>Make it yours. Change the world, the rules,<br>or just the color of the sky.</span></div>
        </section>
        <section class="game-panel" aria-label="Game workspace">
          <div class="game-heading"><div><div class="preview-eyebrow"><span class="live-dot"></span> LIVE PREVIEW</div><div class="title-row"><h2 id="game-title"></h2><span class="genre-badge" id="genre-badge"></span></div></div><button class="icon-button" data-action="rename" title="Rename game" aria-label="Rename game">${icon('settings')}</button></div>
          <div class="preview-card"><div class="preview-window-bar"><div class="window-dots"><i></i><i></i><i></i></div><span id="preview-label">moonlit-grove.game</span><span class="engine-label">LITTLEJS <span>↗</span></span></div>
            <div class="game-stage" id="game-stage"><iframe id="game-frame" title="Playable game preview" allow="fullscreen" referrerpolicy="same-origin"></iframe><div class="game-overlay" id="game-overlay"><div class="overlay-mark">✧</div><span class="overlay-kicker">A WORLD WAITING FOR YOU</span><h3 id="overlay-title"></h3><p id="overlay-description"></p><button class="play-button" data-action="play">${icon('play')} Enter the world</button><small>WASD or arrows to move · Shift to dash</small></div><div class="loading-cover" id="loading-cover"><span class="spinner"></span><span>Bringing your world to life…</span></div></div>
            <div class="game-toolbar"><div class="toolbar-left"><button class="icon-button" data-action="toggle-play" id="toggle-play" aria-label="Play game" title="Play / pause (P)">${icon('play')}</button><button class="icon-button" data-action="restart" aria-label="Restart game" title="Restart (R)">${icon('reset')}</button><button class="icon-button step-control" data-action="step" aria-label="Advance one frame" title="Pause and advance one frame">▸│</button><span class="toolbar-separator"></span><span id="runtime-label" class="runtime-label">Preparing runtime</span></div><div class="toolbar-right"><span class="resolution">960 × 560</span><button class="icon-button" data-action="sound" id="sound-button" aria-label="Enable sound effects" title="Sound effects off">${icon('sound')}<span class="mute-line"></span></button><button class="icon-button" data-action="screenshot" aria-label="Download screenshot" title="Download screenshot">${icon('camera')}</button><button class="icon-button" data-action="fullscreen" aria-label="Open fullscreen" title="Fullscreen">${icon('expand')}</button></div></div>
          </div>
          <div class="touch-controls"><button data-touch="arrowleft" aria-label="Move left">←</button><button data-touch="arrowup" aria-label="Move up">↑</button><button data-touch="arrowdown" aria-label="Move down">↓</button><button data-touch="arrowright" aria-label="Move right">→</button><button data-touch="shift">Dash</button></div>
          <div class="detail-tabs" role="tablist" aria-label="Game details">${[['overview', 'eye', 'Overview'], ['inspector', 'grid', 'Inspector'], ['tests', 'check', 'Playtests'], ['source', 'code', 'Source']].map(([id, symbol, label]) => `<button role="tab" aria-selected="${id === 'overview'}" data-action="tab" data-tab="${id}" class="${id === 'overview' ? 'selected' : ''}">${icon(symbol!)} ${label}${id === 'tests' ? '<span class="test-count" id="test-count">10</span>' : ''}</button>`).join('')}</div>
          <div class="detail-content" id="detail-content" role="tabpanel"></div>
          <div class="workspace-footer"><span><i class="status-dot"></i> Crafted with care. Ready to play.</span><span>From an idea to “one more round.”</span></div>
        </section>
      </main>
    </div>
  </div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal" aria-label="Studio dialog"></dialog><input type="file" id="import-file" accept=".json,application/json" hidden>`;

  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const frame = $<HTMLIFrameElement>('#game-frame');
  const toast = (message: string) => { $('#toast').textContent = message; $('#toast').classList.add('visible'); setTimeout(() => $('#toast').classList.remove('visible'), 4500); };
  const persist = () => {
    try { saveProject(project); library = readProjects(); $('#save-status').innerHTML = '<i></i> Saved locally'; $('#project-count').textContent = String(library.length); }
    catch (error) { $('#save-status').textContent = 'Not saved'; toast(error instanceof Error ? error.message : 'Could not save. Export the project to keep your work.'); }
  };
  const request = (operation: string, args: Record<string, unknown> = {}): Promise<any> => {
    if (!ready) return Promise.reject(new Error('The preview is still loading. Try again in a moment.'));
    const requestId = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('The game did not respond. Restart the preview.')); }, 8000);
      pending.set(requestId, { resolve, reject, timer });
      frame.contentWindow?.postMessage({ source: 'lorecraft-studio', operation, args, requestId }, location.origin);
    });
  };
  const safe = (action: () => Promise<unknown> | void) => { void Promise.resolve().then(action).catch((error: unknown) => toast(error instanceof Error ? error.message : 'Something went wrong.')); };
  const modal = (title: string, body: string) => { const el = $<HTMLDialogElement>('#modal'); el.innerHTML = `<div class="modal-heading"><h2>${escape(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${body}`; if (!el.open) el.showModal(); };
  const objective = (spec: GameSpec) => spec.genre === 'runner' || spec.genre === 'survival' ? `Stay alive for ${spec.timeLimit} seconds. Collect gems along the way for a higher score.` : `Collect ${spec.collectibleCount} ${spec.theme === 'ocean' ? 'pearls' : 'crystals'}${spec.genre === 'shooter' ? ', clear the drones,' : ''} and reach the glowing portal.`;

  function renderDetails() {
    const spec = revision.spec;
    if (tab === 'overview') {
      $('#detail-content').innerHTML = `<div class="overview-grid"><div class="overview-story"><span class="section-caption">THE LITTLE LORE</span><h3>${escape(spec.title)}</h3><p>${escape(spec.description)}</p><div class="objective">${icon('spark')}<span>${escape(objective(spec))}</span></div></div><div class="world-details"><span class="section-caption">WORLD DETAILS</span><dl><div><dt>World</dt><dd>${themeNames[spec.theme]}</dd></div><div><dt>Genre</dt><dd>${genreNames[spec.genre]}</dd></div><div><dt>Difficulty</dt><dd><span class="difficulty-dots">${'●'.repeat(spec.difficulty === 'hard' ? 3 : spec.difficulty === 'normal' ? 2 : 1)}<span>${'●'.repeat(spec.difficulty === 'hard' ? 0 : spec.difficulty === 'normal' ? 1 : 2)}</span></span> ${spec.difficulty}</dd></div><div><dt>Controls</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> + <kbd>⇧</kbd></dd></div></dl></div></div><div class="refine-hint">${icon('spark')} A different twist? Try “make it a space shooter” or “add more enemies” in the prompt.</div>`;
    } else if (tab === 'tests') {
      const passed = revision.checks.filter((c) => c.passed).length;
      $('#detail-content').innerHTML = `<div class="panel-heading"><div><h3>Small checks. Better games.</h3><p>${passed}/${revision.checks.length} deterministic scenarios passed. These test game rules, not human play quality.</p></div><button class="button" data-action="run-tests">${icon('play')} Run again</button></div><div class="checks-list">${revision.checks.map((c) => `<div class="check-row ${c.passed ? 'passed' : 'failed'}"><span>${icon(c.passed ? 'check' : 'close')}</span><div><strong>${escape(c.name)}</strong><p>${escape(c.detail)}</p></div><small>${c.passed ? 'PASS' : 'FAIL'}</small></div>`).join('')}</div>`;
    } else if (tab === 'source') {
      $('#detail-content').innerHTML = `<div class="panel-heading"><div><h3>Your world, under the hood.</h3><p>Validated game data. Edit and apply to create a new revision.</p></div><button class="button" data-action="apply-source">${icon('check')} Apply changes</button></div><label class="sr-only" for="source-editor">Game specification JSON</label><textarea id="source-editor" class="source-editor" spellcheck="false">${escape(JSON.stringify(spec, null, 2))}</textarea><p class="source-note">Source-authored modules use GameModule → LittleJS host → EntityRegistry. Standalone export embeds the same simulation and renderer.</p>`;
    } else {
      const entity = entities.find((e) => e.id === selectedEntity) ?? entities[0];
      if (entity) selectedEntity = entity.id;
      $('#detail-content').innerHTML = `<div class="panel-heading"><div><h3>A world you can inspect.</h3><p>Pause to edit live entities. Save a checkpoint before experimenting.</p></div><div class="inline-actions"><button class="button small" data-action="checkpoint">Checkpoint</button><button class="button small" data-action="restore-checkpoint">Restore</button></div></div><div class="inspector-layout"><div class="entity-list">${entities.map((e) => `<button data-action="select-entity" data-id="${escape(e.id)}" class="${selectedEntity === e.id ? 'active' : ''}"><i class="entity-dot ${e.type}"></i>${escape(e.id)}<small>${escape(e.type)}</small></button>`).join('') || '<p>Loading entities…</p>'}</div><div class="entity-properties">${entity ? `<strong>${escape(entity.id)}</strong><span class="section-caption">POSITION</span><div class="property-row"><label>X<input id="entity-x" type="number" step="0.1" value="${entity.position.x.toFixed(2)}"></label><label>Y<input id="entity-y" type="number" step="0.1" value="${entity.position.y.toFixed(2)}"></label></div><span class="section-caption">SIZE & MOVEMENT</span><div class="property-row"><label>Width<input id="entity-w" type="number" min="0.1" step="0.1" value="${entity.size.x}"></label><label>Height<input id="entity-h" type="number" min="0.1" step="0.1" value="${entity.size.y}"></label><label>Speed<input id="entity-speed" type="number" min="0" max="30" step="0.1" value="${entity.properties.speed}"></label></div><div class="inline-actions"><button class="button" data-action="apply-entity">Apply</button><button class="button quiet danger" data-action="delete-entity">Delete entity</button></div>` : ''}</div></div><details class="runtime-logs"><summary>Runtime evidence · ${logs.length} entries</summary><pre>${escape(logs.map((l) => `[${l.level}] ${l.message}`).join('\n') || 'No runtime errors.')}</pre></details><div class="inspector-footer"><button class="button small quiet" data-action="spawn-coin">+ Add crystal</button><button class="button small quiet" data-action="mcp">Connect MCP</button></div>`;
    }
  }

  function updateProjectView() {
    revision = project.revisions.find((r) => r.id === project.activeRevisionId)!;
    $('#breadcrumb-title').textContent = revision.spec.title; $('#game-title').textContent = revision.spec.title; $('#overlay-title').textContent = revision.spec.title;
    $('#overlay-description').textContent = objective(revision.spec);
    $('#genre-badge').textContent = `2D ${genreNames[revision.spec.genre]}`;
    $('#preview-label').textContent = `${revision.spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.game`;
    $('#test-count').textContent = String(revision.checks.filter((c) => c.passed).length);
    $('#build-note').innerHTML = `<div class="build-note-icon">${icon('check')}</div><div><strong>Your world is ready to explore.</strong><p>${revision.checks.filter((c) => c.passed).length} playtests passed · ${revision.source === 'ai' ? 'AI generated' : 'Local generation'}<br>Refine it with a prompt, or jump right in.</p></div>`;
    $('#generate').innerHTML = `${icon('spark')} ${project.revisions.length > 1 ? 'Refine my game' : 'Create my game'} ${icon('arrow')}`;
    renderDetails();
  }

  function loadPreview(bridge = false) {
    for (const value of pending.values()) { clearTimeout(value.timer); value.reject(new Error('Preview was replaced.')); } pending.clear();
    ready = false; paused = true; snapshot = undefined; entities = []; lastScore = 0; lastHealth = revision.spec.lives;
    if (tab === 'inspector') renderDetails();
    $('#loading-cover').hidden = false; $('#game-overlay').hidden = true; $('#runtime-label').textContent = 'Preparing runtime';
    clearTimeout(loadTimer);
    const url = new URL(location.pathname, location.origin); url.search = new URLSearchParams({ studioGame: '1', project: project.id, revision: revision.id, ...(bridge ? { bridge: '1' } : {}) }).toString();
    frame.src = url.href;
    loadTimer = setTimeout(() => { if (!ready) { $('#loading-cover').hidden = true; $('#runtime-label').textContent = 'Preview failed'; toast('Preview could not start. Try restarting it or check the browser console.'); } }, 15000);
  }

  function sound(frequency: number) {
    if (muted) return;
    try { audio ??= new AudioContext(); void audio.resume(); const tone = audio.createOscillator(), gain = audio.createGain(); tone.type = 'sine'; tone.frequency.setValueAtTime(frequency, audio.currentTime); tone.frequency.exponentialRampToValueAtTime(frequency * 1.5, audio.currentTime + .12); gain.gain.setValueAtTime(.04, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .15); tone.connect(gain); gain.connect(audio.destination); tone.start(); tone.stop(audio.currentTime + .16); } catch { /* Audio is optional; gameplay continues. */ }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'lorecraft-player') return;
    const { type, data, requestId } = event.data;
    if (type === 'ready') { ready = true; clearTimeout(loadTimer); $('#loading-cover').hidden = true; $('#game-overlay').hidden = false; $('#runtime-label').textContent = 'Ready to play'; }
    if (type === 'error') { clearTimeout(loadTimer); $('#loading-cover').hidden = true; toast(`Game error: ${String(data)}`); logs.push({ level: 'error', message: String(data), timestamp: new Date().toISOString() }); }
    if (type === 'response') { const waiter = pending.get(requestId); if (waiter) { clearTimeout(waiter.timer); pending.delete(requestId); if (data?.ok === false) waiter.reject(new Error(data.error?.message ?? 'Runtime operation failed.')); else waiter.resolve(data); } }
    if (type === 'state') {
      const firstEntities = entities.length === 0;
      snapshot = data.snapshot as WorldState; paused = data.paused; entities = data.entities?.data ?? []; logs = data.logs ?? [];
      if (tab === 'inspector' && firstEntities && entities.length) renderDetails();
      $('#game-overlay').hidden = !paused || snapshot?.outcome !== 'playing';
      $('#toggle-play').innerHTML = icon(paused ? 'play' : 'pause'); $('#toggle-play').setAttribute('aria-label', paused ? 'Play game' : 'Pause game');
      $('#runtime-label').textContent = paused ? 'Paused' : snapshot?.outcome === 'playing' ? 'Playing' : snapshot?.outcome === 'won' ? 'World complete' : 'Try again · R to restart';
      if (snapshot && snapshot.score > lastScore) sound(620); if (snapshot && snapshot.health < lastHealth) sound(160);
      lastScore = snapshot?.score ?? 0; lastHealth = snapshot?.health ?? revision.spec.lives;
    }
  });

  async function addRevision(spec: GameSpec, prompt: string, source: 'local' | 'ai', checks = playtest(spec)) {
    const next: Revision = { id: uuid(), spec, prompt, source, checks, createdAt: new Date().toISOString() };
    project.revisions.push(next); project.revisions = project.revisions.slice(-50); project.activeRevisionId = next.id; project.updatedAt = next.createdAt;
    persist(); updateProjectView(); loadPreview();
  }

  async function generate(prompt: string) {
    if (generating) return; generating = true;
    $('#generate').setAttribute('disabled', ''); $('#prompt').setAttribute('disabled', '');
    const progress = $('#generation-progress'); progress.hidden = false;
    progress.innerHTML = `<div class="progress-title"><span class="spinner"></span> A world is taking shape</div>${['Reading your little lore', 'Building the scene and rules', 'Running gameplay checks', 'Preparing your playable world'].map((label, i) => `<div class="progress-step" id="progress-${i}"><span>${i + 1}</span>${label}</div>`).join('')}`;
    try {
      $('#progress-0').classList.add('done');
      let result: { spec: GameSpec; source: 'local' | 'ai'; checks: Revision['checks']; notes?: string[] };
      // Static deployments retain a complete local workflow; AI requests require the local server endpoint.
      if (generationMode === 'local') {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const spec = compilePrompt(prompt, revision.spec); $('#progress-1').classList.add('done');
        await new Promise((resolve) => setTimeout(resolve, 100)); result = { spec, source: 'local', checks: playtest(spec) };
      } else {
        const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(65000), body: JSON.stringify({ prompt, previous: revision.spec, mode: 'ai' }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'AI generation failed.');
        result = { ...payload, spec: gameSpecSchema.parse(payload.spec) }; $('#progress-1').classList.add('done');
      }
      $('#progress-2').classList.add('done');
      if (result.checks.some((c) => !c.passed)) throw new Error(`Playtest failed: ${result.checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}. Your current world is preserved.`);
      await addRevision(result.spec, prompt, result.source, result.checks); $('#progress-3').classList.add('done');
      $<HTMLTextAreaElement>('#prompt').value = ''; $('#prompt-count').textContent = '0 / 4000';
      toast(`${result.spec.title} is ready. ${result.checks.length} gameplay checks passed.`);
      setTimeout(() => { progress.hidden = true; }, 2500);
    } catch (error) { progress.hidden = true; toast(error instanceof Error ? error.message : 'Generation failed. Your current world is preserved.'); }
    finally { generating = false; $('#generate').removeAttribute('disabled'); $('#prompt').removeAttribute('disabled'); }
  }

  const play = async () => { await request('resumeGame'); frame.contentWindow?.focus(); };
  const showProjects = () => {
    try { library = readProjects(); } catch (error) { toast(String(error)); }
    modal('Your little worlds', `<p class="modal-intro">Projects stay on this browser. Export a project file to back it up or move it to another device.</p><div class="project-grid">${library.map((p) => { const r = p.revisions.find((v) => v.id === p.activeRevisionId)!; return `<div class="project-card"><div class="project-art theme-${r.spec.theme}"><span>${r.spec.theme === 'forest' ? '♣' : r.spec.theme === 'space' ? '✧' : r.spec.theme === 'ocean' ? '≈' : '♜'}</span></div><div><h3>${escape(r.spec.title)}</h3><p>${genreNames[r.spec.genre]} · ${p.revisions.length} revision${p.revisions.length === 1 ? '' : 's'}</p><div class="inline-actions"><button class="button small" data-action="open-project" data-id="${escape(p.id)}">Open world</button><button class="icon-button danger" data-action="delete-project" data-id="${escape(p.id)}" aria-label="Delete ${escape(r.spec.title)}">${icon('trash')}</button></div></div></div>`; }).join('') || '<p>No saved projects yet.</p>'}</div><button class="button" data-action="import">${icon('folder')} Import project JSON</button>`);
  };

  document.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    safe(async () => {
      if (generating && ['new', 'open-project', 'confirm-delete', 'restore-revision', 'rename', 'apply-source', 'import'].includes(action ?? '')) throw new Error('Wait for generation to finish before changing projects or revisions.');
      if (action === 'menu') modal('Your studio', `<div class="mobile-nav"><button class="button" data-action="new">New world</button><button class="button" data-action="projects">My projects</button><button class="button" data-action="history">Version history</button><button class="button" data-action="settings">Creation engine</button><button class="button" data-action="help">How it works</button></div>`);
      else if (action === 'close-modal') $<HTMLDialogElement>('#modal').close();
      else if (action === 'workspace') $<HTMLDialogElement>('#modal').close();
      else if (action === 'play') await play();
      else if (action === 'toggle-play') { if (paused) await play(); else await request('pauseGame'); }
      else if (action === 'restart') { if (!ready) loadPreview(); else { await request('resetGame'); await play(); } }
      else if (action === 'step') { await request('stepGame', { frames: 1 }); toast('Advanced exactly one simulation frame.'); }
      else if (action === 'fullscreen') { if (!document.fullscreenElement) await $('#game-stage').requestFullscreen(); else await document.exitFullscreen(); }
      else if (action === 'sound') { muted = !muted; $('#sound-button').classList.toggle('sound-on', !muted); $('#sound-button').setAttribute('aria-label', muted ? 'Enable sound effects' : 'Mute sound effects'); $('#sound-button').title = muted ? 'Sound effects off' : 'Sound effects on'; if (!muted) sound(520); toast(muted ? 'Sound effects off.' : 'Sound effects on.'); }
      else if (action === 'screenshot') { const result = await request('captureScreenshot'); download(`${revision.spec.title}.png`, result.data.dataUrl); toast('Screenshot downloaded.'); }
      else if (action === 'save') { persist(); toast('Project saved on this device. Export a JSON backup to take it with you.'); }
      else if (action === 'new') { if (generating) return; $<HTMLDialogElement>('#modal').close(); project = newProject({ ...first, id: uuid(), createdAt: new Date().toISOString() }); persist(); updateProjectView(); loadPreview(); $<HTMLTextAreaElement>('#prompt').value = ''; $('#prompt').focus(); toast('A fresh canvas. What world will you create?'); }
      else if (action === 'example') { const example = examples[Number(button.dataset.index)]!; $<HTMLTextAreaElement>('#prompt').value = example.prompt; $('#prompt-count').textContent = `${example.prompt.length} / 4000`; $('#prompt').focus(); }
      else if (action === 'tab') { tab = button.dataset.tab!; document.querySelectorAll('[role=tab]').forEach((el) => { const selected = (el as HTMLElement).dataset.tab === tab; el.classList.toggle('selected', selected); el.setAttribute('aria-selected', String(selected)); }); if (tab === 'inspector' && ready) await request('pauseGame'); renderDetails(); }
      else if (action === 'run-tests') { revision.checks = playtest(revision.spec); persist(); renderDetails(); toast(`${revision.checks.filter((c) => c.passed).length}/${revision.checks.length} checks passed.`); }
      else if (action === 'apply-source') { const spec = gameSpecSchema.parse(JSON.parse($<HTMLTextAreaElement>('#source-editor').value)); const checks = playtest(spec); if (checks.some((c) => !c.passed)) throw new Error('Edited game did not pass gameplay checks.'); await addRevision(spec, 'Edited game specification', 'local', checks); toast('Validated source applied as a new revision.'); }
      else if (action === 'rename') modal('Name your world', `<form id="rename-form"><label for="world-name">Game title</label><input id="world-name" required maxlength="60" value="${escape(revision.spec.title)}"><button class="button primary" type="submit">Save title</button></form>`);
      else if (action === 'projects') showProjects();
      else if (action === 'open-project') { if (generating) return; project = library.find((p) => p.id === button.dataset.id)!; persist(); updateProjectView(); loadPreview(); $<HTMLDialogElement>('#modal').close(); }
      else if (action === 'delete-project') {
        const id = button.dataset.id!;
        modal('Delete this saved world?', `<p class="modal-intro">This removes its local revisions and checkpoint. Export a JSON backup first if you want to keep it.</p><div class="inline-actions"><button class="button danger" data-action="confirm-delete" data-id="${escape(id)}">Delete saved project</button><button class="button" data-action="projects">Keep it</button></div>`);
      } else if (action === 'confirm-delete') { deleteProject(button.dataset.id!); library = readProjects(); if (project.id === button.dataset.id) { project = library[0] ?? newProject({ ...first, id: uuid() }); updateProjectView(); loadPreview(); } $('#project-count').textContent = String(library.length); showProjects(); }
      else if (action === 'history') modal('Every chapter of your world', `<p class="modal-intro">Restore a revision to revisit its exact rules and seed. Gameplay restarts; checkpoints are stored separately.</p><div class="history-list">${[...project.revisions].reverse().map((r, i) => `<div><span class="revision-number">${String(project.revisions.length - i).padStart(2, '0')}</span><div><strong>${escape(r.spec.title)}</strong><p>${escape(r.prompt)}</p><small>${new Date(r.createdAt).toLocaleString()} · ${r.source === 'ai' ? 'AI' : 'Local'}</small></div><button class="button small" data-action="restore-revision" data-id="${escape(r.id)}">${r.id === revision.id ? 'Current' : 'Restore'}</button></div>`).join('')}</div>`);
      else if (action === 'restore-revision') { if (generating) return; project.activeRevisionId = button.dataset.id!; project.updatedAt = new Date().toISOString(); persist(); updateProjectView(); loadPreview(); $<HTMLDialogElement>('#modal').close(); toast('Revision restored.'); }
      else if (action === 'checkpoint') { await request('pauseGame'); if (!snapshot) throw new Error('Wait for the game to initialize.'); saveCheckpoint(project, snapshot); toast('Checkpoint saved, including score, enemies, and objective progress.'); }
      else if (action === 'restore-checkpoint') { await request('pauseGame'); await request('restore', { state: readCheckpoint(project) }); renderDetails(); toast('Checkpoint restored.'); }
      else if (action === 'select-entity') { selectedEntity = button.dataset.id!; renderDetails(); }
      else if (action === 'apply-entity') {
        await request('pauseGame');
        const value = (id: string) => Number($<HTMLInputElement>(id).value);
        const x = value('#entity-x'), y = value('#entity-y'), w = value('#entity-w'), h = value('#entity-h'), speed = value('#entity-speed');
        if (![x, y, w, h, speed].every(Number.isFinite) || w <= 0 || h <= 0 || w > 10 || h > 10 || speed < 0 || speed > 30 || x < 0 || x > 24 || y < 0 || y > 14) throw new Error('Use finite world positions (X 0–24, Y 0–14), positive sizes up to 10, and speed 0–30.');
        await request('setEntityProperties', { id: selectedEntity, properties: { size: { x: w, y: h }, speed } }); await request('setEntityPosition', { id: selectedEntity, position: { x, y } }); await request('stepGame', { frames: 1 }); renderDetails(); toast('Live entity updated.');
      } else if (action === 'delete-entity') { if (selectedEntity === 'player-1') throw new Error('Keep the controlling player to continue playing. Other entities can be deleted.'); await request('deleteEntity', { id: selectedEntity }); await request('stepGame', { frames: 1 }); renderDetails(); }
      else if (action === 'spawn-coin') { await request('createEntity', { id: `crystal-${Date.now()}`, type: 'coin', dimension: '2d', position: { x: 3, y: 7 }, properties: { size: { x: .4, y: .4 } } }); await request('stepGame', { frames: 1 }); renderDetails(); }
      else if (action === 'mcp') { loadPreview(true); toast('Preview will connect through the authenticated relay. Start pnpm bridge, then use pnpm mcp.'); }
      else if (action === 'export') modal('Take your world with you', `<p class="modal-intro">A game is better when someone else can play it.</p><div class="export-options"><button data-action="export-html">${icon('download')}<span><strong>Playable HTML game</strong><small>One file. Offline. No server or account needed.</small></span>${icon('arrow')}</button><button data-action="export-json">${icon('code')}<span><strong>LoreCraft project</strong><small>All revisions and prompts. Import to keep creating.</small></span>${icon('arrow')}</button><button data-action="import">${icon('folder')}<span><strong>Import a project</strong><small>Open a previously exported .json project.</small></span>${icon('arrow')}</button></div>`);
      else if (action === 'export-html') { download(`${revision.spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, exportHtml(revision.spec), 'text/html'); toast('Standalone game downloaded. Double-click the HTML file to play.'); }
      else if (action === 'export-json') { download(`${revision.spec.title}.lorecraft.json`, JSON.stringify(project, null, 2)); toast('Project backup downloaded.'); }
      else if (action === 'import') $<HTMLInputElement>('#import-file').click();
      else if (action === 'settings') modal('Your creation engine', `<div class="connection-state"><span class="live-dot"></span><strong>${aiAvailable ? 'AI generation is configured' : 'Local generation is ready'}</strong></div><p class="modal-intro">Local generation understands four game genres, five world themes, difficulty, enemy counts, time limits, and refinements. It works without an API key or network.</p><h3>Optional AI generation</h3><p>AI translates richer prompts into the same validated game schema. For OpenAI, set <code>OPENAI_API_KEY</code> and <code>OPENAI_MODEL</code> in a server-side <code>.env</code>. For a custom provider, set <code>LLM_API_KEY</code>, <code>LLM_BASE_URL</code>, <code>LLM_MODEL</code>, and <code>LLM_API_STYLE</code> (<code>responses</code> or <code>chat_completions</code>). Restart the server after configuration. Keys never enter browser storage or exports.</p><pre>LLM_API_KEY=your-provider-key\nLLM_BASE_URL=https://provider.example/v1\nLLM_MODEL=your-model-id\nLLM_API_STYLE=chat_completions\nLLM_JSON_MODE=json_schema</pre><p class="source-note">If your provider does not support strict schemas, try <code>LLM_JSON_MODE=json_object</code> or <code>prompt</code>. Output is always validated locally. A configured key enables AI mode; it does not verify provider connectivity.</p><p class="source-note">The demo supports 2D adventure, shooter, survival, and runner games. Arbitrary 3D games and custom mechanics outside this schema require source authoring.</p>`);
      else if (action === 'help') modal('From a little lore to a playable world', `<ol class="help-steps"><li><strong>Start with an idea.</strong><p>Describe the setting, goal, and challenge. Try “a forest adventure with 6 crystals” or a sample prompt.</p></li><li><strong>Make it playable.</strong><p>Create the game, then enter the world. WASD / arrows move, Shift dashes, Space boosts fire in shooters, P pauses, and R restarts.</p></li><li><strong>Give it your twist.</strong><p>Try “make it easier”, “add 3 enemies”, “change it to an ocean runner”, or edit validated JSON in Source.</p></li><li><strong>Inspect and test.</strong><p>Pause, edit live entities, save checkpoints, and run deterministic gameplay scenarios. Revisions preserve each design.</p></li><li><strong>Let someone play.</strong><p>Export a standalone HTML file for judges or friends. It runs offline without an account or installation.</p></li></ol><p class="source-note">This is a local-first creator studio. Projects are stored on this device. Export JSON to back up your work. AI generation is optional.</p>`);
    });
  });

  $('#prompt-form').addEventListener('submit', (event) => { event.preventDefault(); const prompt = $<HTMLTextAreaElement>('#prompt').value.trim(); if (prompt.length >= 3) void generate(prompt); });
  $('#prompt').addEventListener('input', () => { $('#prompt-count').textContent = `${$<HTMLTextAreaElement>('#prompt').value.length} / 4000`; });
  $('#generation-mode').addEventListener('change', () => { generationMode = $<HTMLSelectElement>('#generation-mode').value as 'local' | 'ai'; });
  document.addEventListener('submit', (event) => {
    if ((event.target as HTMLElement).id !== 'rename-form') return; event.preventDefault();
    safe(async () => { const title = $<HTMLInputElement>('#world-name').value.trim(); if (!title) throw new Error('Enter a title.'); await addRevision({ ...revision.spec, title }, `Renamed to ${title}`, 'local'); $<HTMLDialogElement>('#modal').close(); });
  });
  $('#import-file').addEventListener('change', () => safe(async () => {
    if (generating) throw new Error('Wait for generation to finish before importing.');
    const input = $<HTMLInputElement>('#import-file'), file = input.files?.[0]; if (!file) return;
    try { if (file.size > 2_000_000) throw new Error('Project files must be smaller than 2 MB.'); const imported = parseProject(JSON.parse(await file.text())); imported.id = uuid(); project = imported; persist(); updateProjectView(); loadPreview(); $<HTMLDialogElement>('#modal').close(); toast('Project imported with its revision history.'); } finally { input.value = ''; }
  }));
  for (const button of document.querySelectorAll<HTMLElement>('[data-touch]')) {
    const touch = (down: boolean) => { if (ready) frame.contentWindow?.postMessage({ source: 'lorecraft-studio', operation: 'touch', args: { key: button.dataset.touch, down } }, location.origin); };
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); if (paused) safe(play); touch(true); });
    button.addEventListener('pointerup', () => touch(false)); button.addEventListener('pointercancel', () => touch(false));
  }
  window.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); $('#prompt').focus(); } if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && document.activeElement === $('#prompt')) { event.preventDefault(); $<HTMLFormElement>('#prompt-form').requestSubmit(); } });
  $<HTMLDialogElement>('#modal').addEventListener('click', (event) => { if (event.target === $('#modal')) $<HTMLDialogElement>('#modal').close(); });
  window.addEventListener('pagehide', () => { clearTimeout(loadTimer); for (const p of pending.values()) clearTimeout(p.timer); void audio?.close(); });

  persist(); updateProjectView(); loadPreview();
  if (storageError) toast(storageError);
  try { const response = await fetch('/api/status', { signal: AbortSignal.timeout(3000) }); if (response.ok) { const status = await response.json(); aiAvailable = Boolean(status.aiAvailable); if (aiAvailable) { const option = $<HTMLSelectElement>('#generation-mode').options[1]!; option.disabled = false; option.textContent = 'AI generation'; } } } catch { /* Static/offline mode intentionally keeps local generation available. */ }
}
