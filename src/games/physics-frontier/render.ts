import { landmarks, terrain, WORLD_WIDTH, SCALE } from './simulation';
import type { PhysicsWorld } from './simulation';

export function renderWorld(c: CanvasRenderingContext2D, width: number, height: number, w: PhysicsWorld, camera: { x: number; y: number }, vectors: boolean, paused: boolean): void {
  c.save(); c.fillStyle = '#102938'; c.fillRect(0, 0, width, height);
  const scale = Math.min(width / 960, height / 560);
  c.translate((width - 960 * scale) / 2, (height - 560 * scale) / 2); c.scale(scale, scale);
  const day = (Math.sin(w.elapsed / 130) + 1) / 2;
  const sky = c.createLinearGradient(0, 0, 0, 560); sky.addColorStop(0, day > 0.3 ? '#426d83' : '#142a49'); sky.addColorStop(1, '#c9d9cd');
  c.fillStyle = sky; c.fillRect(0, 0, 960, 560);
  c.fillStyle = '#ffe1a5'; c.shadowColor = '#fff0b0'; c.shadowBlur = 40; c.beginPath(); c.arc(770 - camera.x * 0.012, 145 - day * 45, 35, 0, 7); c.fill(); c.shadowBlur = 0;
  for (let layer = 0; layer < 3; layer++) {
    c.fillStyle = ['#7297a4', '#507c8b', '#305d6d'][layer]!;
    c.beginPath(); c.moveTo(0, 560);
    for (let x = 0; x <= 980; x += 20) {
      const wx = x + camera.x * (0.06 + layer * 0.07);
      c.lineTo(x, 280 + layer * 42 - Math.sin(wx / (180 - layer * 20)) * (60 + layer * 9) - Math.cos(wx / 79) * 20);
    }
    c.lineTo(960, 560); c.fill();
  }
  const sx = (x: number) => x - camera.x + 480, sy = (y: number) => 345 - y + camera.y;
  const left = camera.x - 500, right = camera.x + 500;
  const text = (s: string, x: number, y: number, size: number, color = '#e5f0eb', align: CanvasTextAlign = 'left') => {
    c.fillStyle = color; c.font = `600 ${size}px system-ui`; c.textAlign = align; c.fillText(s, x, y);
  };
  // Small trees and rocks are scenery; the smooth ground and spheres are colliders.
  for (let i = Math.floor(left / 190); i <= Math.ceil(right / 190); i++) {
    const x = i * 190 + Math.sin(i * 17) * 55, y = sy(terrain(x));
    if (x < 20 || x > WORLD_WIDTH) continue;
    c.fillStyle = '#3c5350'; c.fillRect(sx(x) - 4, y - 78, 8, 80);
    for (let j = 0; j < 3; j++) { c.fillStyle = j % 2 ? '#366d62' : '#285b54'; c.beginPath(); c.moveTo(sx(x), y - 136 + j * 27); c.lineTo(sx(x) - 30, y - 66 + j * 21); c.lineTo(sx(x) + 30, y - 66 + j * 21); c.fill(); }
  }
  c.beginPath(); c.moveTo(0, 560);
  for (let x = left; x <= right; x += 8) c.lineTo(sx(x), sy(terrain(x)));
  c.lineTo(980, 560); c.closePath(); c.fillStyle = '#263f3a'; c.fill();
  for (let x = left; x < right; x += 10) {
    c.strokeStyle = x > 1800 && x < 3000 ? '#9ce8f0' : x > 4050 && x < 4700 ? '#d9a3ee' : '#9bb77e';
    c.lineWidth = 5; c.beginPath(); c.moveTo(sx(x), sy(terrain(x))); c.lineTo(sx(x + 10), sy(terrain(x + 10))); c.stroke();
  }
  for (let i = 0; i < landmarks.length; i++) {
    const l = landmarks[i]!, x = sx(l.x), y = sy(terrain(l.x));
    if (x < -160 || x > 1120) continue;
    c.fillStyle = '#b4b9a0'; c.fillRect(x - 3, y - 95, 6, 95);
    c.fillStyle = w.visited.has(i) ? '#edce87' : '#b7d4d8'; c.beginPath(); c.moveTo(x + 3, y - 95); c.lineTo(x + 52, y - 82); c.lineTo(x + 3, y - 67); c.fill();
    text(l.name, x, y - 110, 12, '#f2f2cf', 'center');
    if (i === 4) { c.fillStyle = '#597d80'; c.beginPath(); c.arc(x + 95, y - 25, 48, Math.PI, 0); c.fill(); c.fillRect(x + 47, y - 25, 96, 25); c.fillStyle = '#c7d9cf'; c.save(); c.translate(x + 95, y - 50); c.rotate(-0.6); c.fillRect(-7, -20, 80, 14); c.restore(); }
  }
  const colors = { rubber: '#eeac77', stone: '#90a8b2', wood: '#d1bd83', player: '#c6f1df' };
  for (const b of w.bodies) {
    const x = sx(b.x), y = sy(b.y); if (x < -80 || x > 1040) continue;
    c.fillStyle = '#102c3433'; c.beginPath(); c.ellipse(x, sy(terrain(b.x)) + 2, b.r, 5, 0, 0, 7); c.fill();
    if (b.material === 'player') {
      c.save(); c.translate(x, y); c.scale(w.facing, 1);
      const stride = b.grounded ? Math.sin(w.elapsed * Math.abs(b.vx) * 0.04) * Math.min(7, Math.abs(b.vx) / 30) : 5;
      c.strokeStyle = '#203a48'; c.lineWidth = 7; c.lineCap = 'round';
      for (const sign of [-1, 1]) { c.beginPath(); c.moveTo(sign * 6, 4); c.lineTo(sign * 8 + stride * sign, 21); c.stroke(); }
      c.fillStyle = '#e7b876'; c.fillRect(-13, -17, 24, 25); c.fillStyle = '#56797c'; c.fillRect(-18, -14, 8, 22);
      c.fillStyle = '#e2f4ed'; c.beginPath(); c.arc(1, -25, 13, 0, 7); c.fill(); c.fillStyle = '#375d6c'; c.beginPath(); c.roundRect(0, -32, 12, 11, 4); c.fill();
      c.strokeStyle = '#ebc994'; c.lineWidth = 6; c.beginPath(); c.moveTo(8, -10); c.lineTo(w.held >= 0 ? 25 : 16, w.held >= 0 ? -19 : 1); c.stroke(); c.restore();
    } else {
      c.save(); c.translate(x, y); c.rotate(-b.angle);
      c.fillStyle = colors[b.material]; c.beginPath(); c.arc(0, 0, b.r, 0, 7); c.fill();
      c.strokeStyle = '#1c3b464d'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, b.r * 0.63, 0, 7); c.moveTo(-b.r, 0); c.lineTo(b.r, 0); c.stroke();
      c.fillStyle = '#ffffff44'; c.beginPath(); c.arc(-b.r * 0.3, -b.r * 0.4, b.r * 0.2, 0, 7); c.fill(); c.restore();
      if (b.id === w.held) { c.setLineDash([4, 5]); c.strokeStyle = '#f5dda6'; c.beginPath(); c.moveTo(sx(w.player.x), sy(w.player.y)); c.lineTo(x, y); c.stroke(); c.setLineDash([]); }
    }
    if (vectors) {
      c.strokeStyle = '#f7db86'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + b.vx * 0.15, y - b.vy * 0.15); c.stroke();
      text(`${b.mass} kg`, x, y - b.r - 10, 10, '#fff2cc', 'center');
    }
  }
  c.fillStyle = '#122a36e8'; c.beginPath(); c.roundRect(18, 16, 315, 88, 12); c.fill();
  text('PHYSICS FRONTIER', 34, 43, 19); text('An open world, set in motion.', 34, 65, 12, '#a9c6c7');
  text(`${w.visited.size} / 5 landmarks discovered`, 34, 88, 13, '#efd396');
  const p = w.player, speed = Math.hypot(p.vx, p.vy) / SCALE;
  c.fillStyle = '#122a36e8'; c.beginPath(); c.roundRect(692, 16, 250, 104, 12); c.fill();
  text(`GRAVITY   ${w.gravity.toFixed(2)} m/s²`, 708, 41, 14, '#efd396');
  text(`Speed ${speed.toFixed(1)} m/s  ·  Mass ${p.mass} kg`, 708, 65, 12);
  text(`Kinetic energy ${(0.5 * p.mass * speed ** 2).toFixed(1)} J`, 708, 86, 12);
  text('1 Moon   2 Earth   3 Heavy', 708, 107, 12, '#a9c6c7');
  c.fillStyle = '#142f3be8'; c.fillRect(0, 494, 960, 66);
  text('A/D or ←/→ move   SPACE jump   E grab/release   F throw   B spawn sphere', 480, 518, 13, '#e5f0eb', 'center');
  text('1/2/3 gravity   V velocity vectors   P pause   R reset', 480, 541, 12, '#a9c6c7', 'center');
  // A continuous world map keeps the far-off destinations discoverable.
  c.fillStyle = '#122a36b8'; c.fillRect(350, 24, 270, 48);
  c.strokeStyle = '#92b5b1'; c.lineWidth = 2; c.beginPath(); c.moveTo(366, 43); c.lineTo(604, 43); c.stroke();
  landmarks.forEach((l, i) => { c.fillStyle = w.visited.has(i) ? '#edce87' : '#829b9c'; c.beginPath(); c.arc(366 + l.x / WORLD_WIDTH * 238, 43, 4, 0, 7); c.fill(); });
  c.fillStyle = '#effff2'; c.fillRect(364 + p.x / WORLD_WIDTH * 238, 35, 4, 16);
  text(`${Math.round(p.x / SCALE)} / ${WORLD_WIDTH / SCALE} m`, 485, 64, 10, '#adc6c4', 'center');
  const nearby = landmarks.find(l => Math.abs(l.x - p.x) < 180);
  if (nearby) { c.fillStyle = '#142f3bc9'; c.beginPath(); c.roundRect(200, 137, 560, 39, 10); c.fill(); text(nearby.note, 480, 161, 13, '#f2e5b7', 'center'); }
  if (paused) { c.fillStyle = '#102633bb'; c.fillRect(0, 190, 960, 160); text('SIMULATION PAUSED', 480, 264, 28, '#edf5e9', 'center'); text('Press P to continue exploring', 480, 302, 15, '#c2d9d2', 'center'); }
  c.restore();
}
