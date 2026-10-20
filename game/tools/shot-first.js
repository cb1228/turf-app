// はじめて開いた人の流れ（説明3枚→最初の地図）を、小さい画面（375x667）で撮る（CX点検用）
// 使い方: cd game && node tools/shot-first.js 出力フォルダ
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
  await p.evaluateOnNewDocument(() => { const G = Geolocation.prototype; G.getCurrentPosition = function () {}; G.watchPosition = function () { return 1; }; if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: 'prompt' }); });
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url();
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await sleep(1800);
  for (let i = 0; i < 3; i++) {
    await p.screenshot({ path: path.join(OUT, 'first_' + i + '.png') });
    await p.evaluate((k) => { const s = document.getElementById('slides'); s.scrollLeft = s.clientWidth * (k + 1); }, i); await sleep(700);
  }
  await p.evaluate(() => document.getElementById('onbNext').click()); await sleep(1500);
  await p.screenshot({ path: path.join(OUT, 'first_3.png') });
  await br.close(); srv.close();
});
