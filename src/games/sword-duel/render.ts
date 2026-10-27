import { moves } from './combat';
import type { SwordMatch, Fighter } from './combat';

export function renderMatch(c: CanvasRenderingContext2D, width: number, height: number, m: SwordMatch): void {
  c.save(); c.fillStyle = '#0b1020'; c.fillRect(0, 0, width, height);
  const scale = Math.min(width / 960, height / 600);
  c.translate((width - 960 * scale) / 2, (height - 600 * scale) / 2); c.scale(scale, scale);
  const text = (s: string, x: number, y: number, size: number, color = '#f0e9d7', align: CanvasTextAlign = 'center') => {
    c.font = `700 ${size}px system-ui`; c.fillStyle = color; c.textAlign = align; c.fillText(s, x, y);
  };
  const sky = c.createLinearGradient(0, 0, 0, 460); sky.addColorStop(0, '#111a35'); sky.addColorStop(1, '#4a5266');
  c.fillStyle = sky; c.fillRect(0, 0, 960, 600);
  c.fillStyle = '#f3dfaa'; c.beginPath(); c.arc(755, 175, 43, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 9; i++) {
    const x = i * 135 - 55, top = 250 + (i % 3) * 21;
    c.fillStyle = '#1c2a40'; c.fillRect(x, top, 90, 210);
    for (let j = 0; j < 3; j++) c.fillRect(x + j * 34 - 3, top - 20, 25, 27);
    c.fillStyle = '#e0a26855'; c.fillRect(x + 35, top + 40, 16, 40);
  }
  c.fillStyle = '#343d4a'; c.fillRect(0, 437, 960, 100);
  c.fillStyle = '#7d8792'; c.fillRect(0, 437, 960, 8);
  c.strokeStyle = '#222c3a'; c.lineWidth = 2;
  for (let y = 467; y < 530; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(960, y); c.stroke(); }
  for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(480 + (i - 7) * 90, 445); c.lineTo(480 + (i - 7) * 130, 537); c.stroke(); }
  for (const x of [95, 865]) {
    c.fillStyle = '#222936'; c.fillRect(x - 7, 300, 14, 140);
    c.fillStyle = '#ffb355'; c.shadowColor = '#ff9033'; c.shadowBlur = 25;
    c.beginPath(); c.ellipse(x, 292, 10, 23 + Math.sin(m.timer * 17) * 3, 0, 0, 7); c.fill(); c.shadowBlur = 0;
  }
  const drawFighter = (f: Fighter, color: string) => {
    c.fillStyle = '#0005'; c.beginPath(); c.ellipse(f.x, 448, 42, 9, 0, 0, 7); c.fill();
    c.save(); c.translate(f.x, 439 - f.y); c.scale(f.face, 1);
    const a = f.attack, active = a && a.elapsed >= moves[a.kind].windup && a.elapsed < moves[a.kind].windup + 0.13;
    const swing = a?.kind === 'sword' ? Math.sin(Math.min(1, a.elapsed / 0.5) * Math.PI) : 0;
    const limb = (points: number[][], stroke: string, weight: number) => {
      c.strokeStyle = stroke; c.lineWidth = weight; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      points.forEach(([x, y], i) => i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)); c.stroke();
    };
    const stride = f.attack || f.blocking ? 0 : Math.sin(f.walk) * 10;
    limb([[-7, -44], [-17 - stride, -23], [-23 - stride, 0]], '#172438', 13);
    limb([[8, -44], [active && a?.kind === 'kick' ? 41 : 18 + stride, -25], [active && a?.kind === 'kick' ? 92 : 25 + stride, active && a?.kind === 'kick' ? -49 : 0]], '#283b52', 14);
    c.fillStyle = f.flash > 0 ? '#fff' : color; c.beginPath(); c.roundRect(-20, -91, 40, 52, 8); c.fill();
    c.fillStyle = '#d6aa80'; c.beginPath(); c.arc(0, -109, 17, 0, 7); c.fill();
    c.fillStyle = '#d5e1e7'; c.fillRect(-19, -125, 37, 16); c.fillStyle = '#223348'; c.fillRect(1, -115, 18, 5);
    c.fillStyle = color; c.fillRect(-22, -125, 9, 28);
    limb([[-12, -84], [-27, -65], [-13, -57]], '#acbaca', 10);
    const handX = f.blocking ? 25 : active && a?.kind === 'punch' ? 69 : 28 + swing * 20;
    const handY = f.blocking ? -99 : -73 + swing * 4;
    limb([[13, -83], [26, -78], [handX, handY]], '#c8d3df', 11);
    c.fillStyle = '#d6aa80'; c.beginPath(); c.arc(handX, handY, 6, 0, 7); c.fill();
    c.save(); c.translate(handX, handY); c.rotate(f.blocking ? -1.3 : a?.kind === 'sword' ? -1.9 + swing * 2.6 : -0.95);
    limb([[-9, 0], [13, 0]], '#e6b55f', 5);
    c.fillStyle = '#e1eef2'; c.beginPath(); c.moveTo(9, -5); c.lineTo(90, -3); c.lineTo(105, 0); c.lineTo(90, 4); c.lineTo(9, 5); c.fill();
    c.restore();
    if (active && a?.kind === 'sword') { c.strokeStyle = '#e9f6ff9c'; c.lineWidth = 8; c.beginPath(); c.arc(10, -70, 125, -0.85, 0.65); c.stroke(); }
    if (f.blocking) { c.strokeStyle = '#a7e4ff9c'; c.lineWidth = 3; c.beginPath(); c.ellipse(32, -73, 12, 43, 0, -1.5, 1.5); c.stroke(); }
    c.restore();
  };
  drawFighter(m.fighters[0], '#54cdd0'); drawFighter(m.fighters[1], '#ed9672');
  for (const s of m.sparks) {
    c.strokeStyle = s.blocked ? '#90e7ff' : '#ffdb83'; c.lineWidth = 3;
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4, r = (1 - s.life / 0.22) * 28 + 5; c.beginPath(); c.moveTo(s.x + Math.cos(angle) * 5, s.y + Math.sin(angle) * 5); c.lineTo(s.x + Math.cos(angle) * r, s.y + Math.sin(angle) * r); c.stroke(); }
  }
  c.fillStyle = '#0a1020ed'; c.fillRect(0, 0, 960, 122);
  text('S W O R D   D U E L', 480, 26, 16, '#c0c9d8');
  m.fighters.forEach((f, i) => {
    const x = i === 0 ? 38 : 572, color = i === 0 ? '#54cdd0' : '#ed9672';
    text(`PLAYER ${i + 1}`, x, 47, 15, color, 'left');
    c.fillStyle = '#293248'; c.fillRect(x, 60, 350, 19); c.fillStyle = color;
    c.fillRect(i === 0 ? x : x + 350 * (1 - f.health / 100), 60, 350 * f.health / 100, 19);
    text(`${f.health} HP`, x + 175, 75, 12, '#0b1020');
    for (let j = 0; j < 2; j++) { c.fillStyle = f.wins > j ? '#f0cf7c' : '#34415c'; c.beginPath(); c.arc(x + 9 + j * 22, 96, 6, 0, 7); c.fill(); }
  });
  text(String(Math.ceil(m.timer)).padStart(2, '0'), 480, 76, 36); text(`ROUND ${m.round}`, 480, 101, 12, '#a5b3ca');
  c.fillStyle = '#0b1020f2'; c.fillRect(0, 535, 960, 65);
  text('P1   A / D move · W jump · S block', 30, 557, 13, '#54cdd0', 'left');
  text('F punch · G kick · H sword', 30, 581, 14, '#e0e6ee', 'left');
  text('P2   ← / → move · ↑ jump · ↓ block', 930, 557, 13, '#ed9672', 'right');
  text('J punch · K kick · L sword', 930, 581, 14, '#e0e6ee', 'right');
  text('P pause   R reset', 480, 580, 12, '#a5b3ca');
  if (m.phase !== 'fight' || m.paused) {
    c.fillStyle = '#091121df'; c.beginPath(); c.roundRect(190, 203, 580, 174, 15); c.fill();
    const result = m.winner < 0 ? 'DRAW' : `PLAYER ${m.winner + 1} WINS`;
    text(m.paused ? 'PAUSED' : m.phase === 'ready' ? 'STEEL MEETS SKILL' : result, 480, 255, 32);
    text(m.paused ? 'Press P to return to the duel' : m.phase === 'ready' ? 'Two players. One arena. First to two round wins.' : m.phase === 'matchOver' ? 'MATCH COMPLETE · Enter or click for a rematch' : 'Round complete · Next round begins shortly', 480, 296, 17, '#b7c4d8');
    text(m.phase === 'ready' ? 'ENTER / CLICK TO BEGIN' : m.phase === 'matchOver' ? 'Thanks for the duel.' : 'Timing and distance decide the fight.', 480, 341, 16, '#f0cf7c');
  }
  c.restore();
}
