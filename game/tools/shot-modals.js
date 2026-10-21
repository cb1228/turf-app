// 小窓（.modal）をひとつずつ開いて、はみ出し（縦の中身＞枠・横のはみ出し）を調べて撮る（CX点検用）
// 使い方: cd game && W=320 H=568 node tools/shot-modals.js 出力フォルダ
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
  const p = await br.newPage(); await p.setViewport({ width: +(process.env.W || 375), height: +(process.env.H || 667), deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument((st, big) => { window.__st = st; window.__big = big; }, process.env.STREAK || 0, !!process.env.BIG);
  await p.evaluateOnNewDocument(() => {
    const G = Geolocation.prototype; G.getCurrentPosition = function (ok) { ok && ok({ coords: { latitude: 35.6852, longitude: 139.7700, accuracy: 10 }, timestamp: Date.now() }); }; G.watchPosition = function () { return 1; };
    if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: 'granted' });
    localStorage.setItem('turf_v3', JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 }, n: [5, 2], av: 2, xp: 2400, loops: 6, chests: 4, gold: 3, ll: [35.685, 139.77], muni: '13102', newsSeen: '9.9.9', lastDay: '2026-10-15', streak: Number(window.__st || 0), big: !!window.__big }));
  });
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url();
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await sleep(2500);
  await p.evaluate(() => document.querySelectorAll('.modal.show,.coach').forEach((m) => m.classList && m.classList.remove('show')));
  const ids = await p.evaluate(() => [...document.querySelectorAll('.modal')].map((m) => m.id));
  for (const id of ids) {
    await p.evaluate((id) => document.getElementById(id).classList.add('show'), id); await sleep(700);
    const r = await p.evaluate((id) => { const m = document.getElementById(id); const c = m.querySelector('.mcard') || m; const cut = [...c.querySelectorAll('*')].filter((e) => e.offsetWidth && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => (e.id || e.className) + ''); const bt = [...c.querySelectorAll('button')].filter((b) => b.offsetWidth && b.scrollHeight > b.clientHeight + 2).map((b) => b.textContent.trim().slice(0, 20)); return { id, sh: c.scrollHeight, ch: c.clientHeight, over: c.scrollHeight - c.clientHeight, cut, wrapBtn: bt }; }, id);
    await p.screenshot({ path: path.join(OUT, 'm_' + id + '.png') });
    console.log(JSON.stringify(r));
    await p.evaluate((id) => document.getElementById(id).classList.remove('show'), id); await sleep(150);
  }
  await br.close(); srv.close();
});
