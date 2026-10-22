// 「征服した場所」（戦績の中）を、東京と京都と箱根に領地がある想定で小さい画面に撮る（CX点検用）
// 使い方: cd game && node tools/shot-places.js 出力フォルダ
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const CELL = 0.00030, cells = [];
function blob(lat, lng, r) { const cy = Math.floor(lat / CELL), cx = Math.floor(lng / CELL); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) cells.push((cx + x) + ',' + (cy + y)); }
blob(35.685, 139.770, 12); blob(35.010, 135.768, 7); blob(35.232, 139.106, 5);
const day = 86400e3, now = Date.now();
const cq = [{ t: now - 2 * day, la: 35.685, lo: 139.77, n: 300 }, { t: now - 20 * day, la: 35.01, lo: 135.768, n: 150 }, { t: now - 19 * day, la: 35.01, lo: 135.768, n: 20 }, { t: now - 40 * day, la: 35.232, lo: 139.106, n: 80 }];
const srv = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  const ext = path.extname(f); w.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: require('os').tmpdir() + '/turf-shot-' + Date.now() });
  const p = await br.newPage(); await p.setViewport({ width: +(process.env.W || 375), height: +(process.env.H || 667), deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument((st) => { localStorage.setItem('turf_v3', st); }, JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 }, n: [5, 2], av: 2, xp: 2400, loops: 4, c: cells, cq, newsSeen: '9.9.9' }));
  p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('requestfailed', (r) => console.log('FAIL', r.url().slice(0, 90)));
  p.on('request', (r) => { if (r.url().includes('gsi')) console.log('REQ', r.url().slice(0, 120)); });
  await p.setRequestInterception(true);
  const MUNIS = { '35.68_139.77': '13102', '35.01_135.77': '26104', '35.23_139.11': '14384' };
  p.on('request', (r) => { const u = r.url();
    if (u.includes('reverse-geocoder') && process.env.NOGEO) return r.abort();
    if (u.includes('reverse-geocoder')) { const m = u.match(/lat=([\d.]+)&lon=([\d.]+)/); const lo = m ? +m[2] : 0, cd = !m ? null : lo < 137 ? '26104' : lo < 139.5 ? '14384' : '13102'; return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ results: cd ? { muniCd: cd } : null }) }); }
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await sleep(2000);
  if (process.env.NEWS) { await sleep(9000); await p.screenshot({ path: path.join(OUT, 'news.png') }); console.log('news', await p.evaluate(() => { const c = document.querySelector('#newsModal .mcard'); return document.getElementById('newsModal').classList.contains('show') && { sh: c.scrollHeight, ch: c.clientHeight }; })); }
  await p.evaluate(() => { document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')); document.getElementById('rankCard').click(); }); await sleep(1500);
  await p.evaluate(() => { const e = document.querySelector('#jpOpen'); if (e) e.scrollIntoView({ block: 'start' }); }); await sleep(600);
  const names = await p.evaluate(() => [...document.querySelectorAll('.place .pn')].map((e) => e.textContent));
  console.log(JSON.stringify(names));
  await p.screenshot({ path: path.join(OUT, 'places.png') });
  await sleep(1500); await p.evaluate(() => { document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')); const e = document.querySelector('#jpList'); if (e) e.scrollIntoView({ block: 'start' }); }); await sleep(500);
  console.log('jp', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#jpList .jprow')].map((e) => e.innerText.replace(/\s+/g, ' ')))));
  await p.screenshot({ path: path.join(OUT, 'places_jp.png') });
  await p.evaluate(() => document.querySelector('.place').click()); await sleep(1500);
  await p.screenshot({ path: path.join(OUT, 'places_fly.png') });
  await br.close(); srv.close();
});
