// GPSのブレを再現した歩行シミュレーション。本物のゲーム画面(site/turf.html)に位置を流し込み、囲みの判定が正しいかを数字で確かめる。
// 使い方: cd game && node tests/gps-sim.js   （Chrome のパスは環境変数 CHROME で変更可）
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const SITE = path.join(__dirname, '..', '..', 'site');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ---- 決定的な乱数とGPSのブレ ----
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const LAT0 = 35.6812, LNG0 = 139.7671, MLAT = 111320, MLNG = 111320 * Math.cos(LAT0 * Math.PI / 180);
// waypoints(メートル座標)を歩く速さでたどり、stops=[[経過秒, 止まる秒]] で立ち止まる。fix間隔2秒、ブレσ、たまに大ブレ
function trace(waypoints, { speed = 1.3, dt = 2, sigma = 6, spike = 0.03, spikeM = 28, stops = [], seed = 1 } = {}) {
  const r = rng(seed), out = []; let t = 0, bx = 0, by = 0; // bx,by: ゆっくり動くバイアス(マルチパス)
  const fix = (x, y) => { bx = bx * 0.9 + gauss(r) * sigma * 0.45; by = by * 0.9 + gauss(r) * sigma * 0.45;
    let nx = x + bx + gauss(r) * sigma * 0.5, ny = y + by + gauss(r) * sigma * 0.5;
    if (r() < spike) { const a = r() * 6.283; nx += Math.cos(a) * spikeM; ny += Math.sin(a) * spikeM; }
    out.push({ lat: LAT0 + ny / MLAT, lng: LNG0 + nx / MLNG, acc: Math.round(sigma * 1.6 + r() * 6), t: t * 1000 }); };
  let pendingStops = stops.slice();
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x0, y0] = waypoints[i], [x1, y1] = waypoints[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / (speed * dt)));
    for (let k = 0; k < n; k++) { const f = k / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f; fix(x, y); t += dt;
      if (pendingStops.length && t >= pendingStops[0][0]) { const [, dur] = pendingStops.shift(); for (let s = 0; s < dur; s += dt) { fix(x, y); t += dt; } } }
  }
  const [xl, yl] = waypoints[waypoints.length - 1]; fix(xl, yl);
  return out;
}
// 各シナリオを乱数の種 SEEDS 通りで試し、期待どおりだった割合を出す
const SEEDS = +(process.env.SEEDS || 8);
const GEN = {
  A_block_loop_with_stop: { make: (sd) => trace([[0, 0], [400, 0], [400, 300], [0, 300], [0, 0], [60, 0]], { stops: [[300, 90]], seed: sd }), ok: (r) => r.loops === 1 && r.best >= 80 },
  B_out_and_back: { make: (sd) => trace([[0, 0], [600, 0], [0, 12]], { seed: sd }), ok: (r) => r.loops === 0 },
  C_standing_still: { make: (sd) => trace([[0, 0], [0.1, 0]], { stops: [[0, 300]], seed: sd }), ok: (r) => r.loops === 0 && r.dist < 200 },
  D_small_park_loop: { make: (sd) => trace([[0, 0], [150, 0], [150, 120], [0, 120], [0, 0], [30, 0]], { seed: sd }), ok: (r) => r.loops === 1 },
  E_noisy_downtown: { make: (sd) => trace([[0, 0], [300, 0], [300, 250], [0, 250], [0, 0], [50, 0]], { sigma: 10, spike: 0.06, spikeM: 40, stops: [[200, 60], [500, 60]], seed: sd }), ok: (r) => r.loops === 1 },
};
const SCEN = {};
for (const [k, g] of Object.entries(GEN)) for (let sd = 1; sd <= SEEDS; sd++) SCEN[k + '#' + sd] = { pts: g.make(sd * 7 + 3), ok: g.ok, group: k };

function serve() { return new Promise((res) => { const s = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/' ) f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp)) { w.writeHead(404); return w.end(); }
  w.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await serve(), port = srv.address().port;
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });
  const results = {};
  for (const [name, sc] of Object.entries(SCEN)) {
    const p = await br.newPage(); await p.setRequestInterception(true);
    p.on('request', (q) => { const u = q.url(); (u.startsWith('http://127.0.0.1') ? q.continue() : q.respond({ status: 200, contentType: 'application/json', body: '{}' })); });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/turf.html`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => localStorage.setItem('turf_v3', JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 } })));
    await p.reload({ waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 600));
    const r = await p.evaluate((pts) => {
      const t0 = Date.now();
      navigator.geolocation.watchPosition = (ok) => { pts.forEach((q) => ok({ coords: { latitude: q.lat, longitude: q.lng, accuracy: q.acc }, timestamp: t0 + q.t })); return 1; };
      navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click();
      window.dispatchEvent(new Event('pagehide')); // 歩行中は保存がまとめられるので、画面を離れた時の保存を起こしてから読む
      const s1 = JSON.parse(localStorage.getItem('turf_v3')); const walkingCells = s1.c.length;
      document.getElementById('btnGo').click(); // 一時停止（ほぼ一周なら閉じる処理も走る）
      const s = JSON.parse(localStorage.getItem('turf_v3'));
      return { loops: s.loops || 0, best: s.best || 0, cells: s.c.length, cellsBeforeStop: walkingCells, dist: Math.round(s.d || 0) };
    }, sc.pts);
    results[name] = Object.assign({ fixes: sc.pts.length }, r, errs.length ? { errs } : {});
    await p.close();
  }
  await br.close(); srv.close();
  const sum = {};
  for (const [name, r] of Object.entries(results)) { const g = SCEN[name].group; sum[g] = sum[g] || { pass: 0, n: 0, fails: [] };
    sum[g].n++; if (SCEN[name].ok(r)) sum[g].pass++; else sum[g].fails.push({ seed: name.split('#')[1], loops: r.loops, best: r.best, dist: r.dist }); }
  for (const [g, v] of Object.entries(sum)) console.log(`${v.pass === v.n ? 'OK  ' : 'NG  '}${g}: ${v.pass}/${v.n}` + (v.fails.length ? '  ' + JSON.stringify(v.fails) : ''));
  if (process.env.VERBOSE) console.log(JSON.stringify(results, null, 1));
  process.exitCode = Object.values(sum).every((v) => v.pass === v.n) ? 0 : 1;
})();
