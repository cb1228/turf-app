// 領地マップを、東京・京都・箱根に領地と歩いた道がある想定で小さい画面に撮る（CX点検用）
// 使い方: cd game && node tools/shot-fog.js 出力フォルダ
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const CELL = 0.00030, cells = [];
function blob(lat, lng, r) { const cy = Math.floor(lat / CELL), cx = Math.floor(lng / CELL); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) cells.push((cx + x) + ',' + (cy + y)); }
blob(35.685, 139.770, 12); blob(35.010, 135.768, 7); blob(35.232, 139.106, 5);
for (let i = 0; i < 160; i++) { const la = 35.685 - i * 0.00025, lo = 139.770 + Math.sin(i / 14) * 0.004 + i * 0.0002; cells.push(Math.floor(lo / CELL) + ',' + Math.floor(la / CELL)); }
for (let i = 0; i < 90; i++) cells.push(Math.floor((139.776 + i * 0.0003) / CELL) + ',' + Math.floor(35.69 / CELL));
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
    if (u.includes('reverse-geocoder')) { const m = u.match(/lat=([\d.]+)&lon=([\d.]+)/); const lo = m ? +m[2] : 0, cd = !m ? null : lo < 137 ? '26104' : lo < 139.5 ? '14384' : '13102'; return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ results: cd ? { muniCd: cd } : null }) }); }
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
    if (u.startsWith(base) || /arcgisonline|unpkg|cdnjs|jsdelivr/.test(u)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await sleep(2000);
  await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')));
  await p.evaluate(() => document.getElementById('btnFog').click()); await sleep(1800);
  console.log(await p.evaluate(() => document.getElementById('fogTxt').innerText));
  console.log(await p.evaluate(() => [...document.querySelectorAll('.leaflet-fog-pane canvas')].map((c) => c.style.transform + ' ' + c.parentNode.style.transform).slice(0, 8)));
  await p.screenshot({ path: path.join(OUT, 'fog_all.png') });
  await sleep(1500); await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'))); await sleep(300); console.log('cards', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#fogPlaces .fpc')].map((b) => b.innerText.split(String.fromCharCode(10)).join(' / ')))));
  await p.screenshot({ path: path.join(OUT, 'fog_cards.png') });
  await p.evaluate(() => document.querySelectorAll('#fogPlaces .fpc')[2].click()); await sleep(1800);
  await p.screenshot({ path: path.join(OUT, 'fog_fly.png') });
  await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')));
  await p.evaluate(() => 0); await p.mouse.move(278, 314); await sleep(300);
  await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'))); await sleep(500);
  await p.screenshot({ path: path.join(OUT, 'fog_zoom.png') });
  await br.close(); srv.close();
});
