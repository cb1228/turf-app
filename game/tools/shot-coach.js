// 2回目に囲んだ後、リザルトを閉じたときに出る「領地マップ」ボタンの案内を小さい画面で撮る（CX点検用）
// 使い方: cd game && node tools/shot-coach.js 出力フォルダ
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const srv = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  const ext = path.extname(f); w.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: require('os').tmpdir() + '/turf-shot-' + Date.now() });
  const p = await br.newPage(); await p.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument(() => {
    const G = Geolocation.prototype; G.getCurrentPosition = function (ok) { ok && ok({ coords: { latitude: 35.6852, longitude: 139.7700, accuracy: 10 }, timestamp: Date.now() }); }; G.watchPosition = function () { return 1; };
    if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: 'granted' });
    localStorage.setItem('turf_v3', JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 }, n: [5, 2], av: 2, xp: 2400, loops: 6, chests: 4, gold: 3, ll: [35.685, 139.77], muni: '13102', newsSeen: '9.9.9', lastDay: '2026-10-15' }));
  });
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url();
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await sleep(2500);
  await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')));
  await p.evaluate(() => document.getElementById('rClose').click()); await sleep(1800);
  await p.screenshot({ path: path.join(OUT, 'coach_wait.png') });
  for (let i = 0; i < 3; i++) { await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'))); await sleep(1700); }
  await p.screenshot({ path: path.join(OUT, 'coach_map.png') });
  await br.close(); srv.close();
});
