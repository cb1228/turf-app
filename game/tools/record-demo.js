// 宣伝動画の素材を 1080x1920・60fps で「コマ撮り」する。
// ページ内の時計(Date / performance.now / setTimeout / requestAnimationFrame / CSSアニメーション)を乗っ取り、
// 1/60秒ずつ進めては撮影するので、撮影に時間がかかってもカクつかない。
// 使い方: cd game && node tools/record-demo.js [秒数=30] [出力=demo60.mp4] [URLの?以降=demo=2]
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const SITE = path.join(__dirname, '..', '..', 'site');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SEC = +(process.argv[2] || 30), OUT = process.argv[3] || 'demo60.mp4', QUERY = process.argv[4] || 'demo=2', FPS = 60;

const VIRTUAL_TIME = () => {
  let now = 0; const D = Date, t0 = D.now(); const timers = new Map(); let tid = 1, rafs = [];
  function VDate(...a) { return a.length ? new D(...a) : new D(t0 + now); }
  VDate.prototype = D.prototype; VDate.now = () => t0 + now; VDate.parse = D.parse; VDate.UTC = D.UTC; window.Date = VDate;
  performance.now = () => now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = tid++; timers.set(id, { t: now + Math.max(0, +ms || 0), fn, a }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.setInterval = (fn, ms = 0, ...a) => { const id = tid++; timers.set(id, { t: now + Math.max(1, +ms || 1), fn, a, iv: Math.max(1, +ms || 1) }); return id; };
  window.clearInterval = window.clearTimeout;
  window.requestAnimationFrame = (fn) => { rafs.push(fn); return rafs.length; };
  window.cancelAnimationFrame = () => {};
  const seen = new WeakMap();
  window.__advance = (dt) => {
    const target = now + dt;
    for (;;) { let nx = null, nid = 0; for (const [id, e] of timers) if (e.t <= target && (!nx || e.t < nx.t)) { nx = e; nid = id; }
      if (!nx) break; now = nx.t; if (nx.iv) nx.t += nx.iv; else timers.delete(nid);
      try { typeof nx.fn === 'function' ? nx.fn(...nx.a) : 0; } catch (e) { console.error(e); } }
    now = target; const cbs = rafs; rafs = []; for (const f of cbs) { try { f(now); } catch (e) { console.error(e); } }
    for (const an of document.getAnimations()) { try { let v = seen.get(an); if (v === undefined) { v = an.currentTime || 0; an.pause(); } v += dt; seen.set(an, v); an.currentTime = v; } catch (e) {} }
  };
};

function serve() { return new Promise((res) => { const s = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  const ext = path.extname(f); w.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`;
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', ...(process.env.CI ? ['--no-sandbox'] : [])] });
  const p = await br.newPage(); await p.setViewport({ width: 405, height: 720, deviceScaleFactor: 1080 / 405 });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  await p.evaluateOnNewDocument(VIRTUAL_TIME);
  await p.goto(`${base}/turf.html?${QUERY}`, { waitUntil: 'domcontentloaded' });
  // 地図タイル・フォントの読み込みを待ちながら、最初の1.5秒ぶんを進めておく
  for (let i = 0; i < 30; i++) { await p.evaluate(() => window.__advance(50)); await new Promise((r) => setTimeout(r, 120)); }
  await p.evaluate(() => document.fonts && document.fonts.ready);
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = SEC * FPS, t0 = Date.now();
  for (let f = 0; f < N; f++) {
    await p.evaluate((dt) => window.__advance(dt), 1000 / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${N} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  await br.close(); srv.close(); console.log('done', OUT);
})();
