// 歩いている途中（コの字に歩いた所）を小さい画面で撮り、「戻れば領地になる形」の見え方を点検する
// 使い方: cd game && node tools/shot-ghost.js 出力フォルダ
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const srv = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  w.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: require('os').tmpdir() + '/turf-shot-' + Date.now() });
  const p = await br.newPage(); await p.setViewport({ width: +(process.env.W || 375), height: +(process.env.H || 667), deviceScaleFactor: 2 });
  const own = []; if (process.env.OWN) for (let y = Math.floor(35.684 / 0.0003); y <= Math.floor(35.688 / 0.0003); y++) for (let x = Math.floor(139.769 / 0.0003); x <= Math.floor(139.773 / 0.0003); x++) own.push(x + ',' + y);
  await p.evaluateOnNewDocument((o, f) => { window.__own = o; window.__first = f; }, own, !!process.env.FIRST);
  await p.evaluateOnNewDocument(() => {
    const G = Geolocation.prototype; let cb = null, tt = Date.now();
    G.getCurrentPosition = function (ok) { ok && ok({ coords: { latitude: 35.6852, longitude: 139.7700, accuracy: 8 }, timestamp: Date.now() }); };
    G.watchPosition = function (ok) { cb = ok; return 1; }; G.clearWatch = function () {};
    window.__fix = (la, lo) => cb && cb({ coords: { latitude: la, longitude: lo, accuracy: 8, speed: 1.3 }, timestamp: (tt += 12000) });
    if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: 'granted' });
    localStorage.setItem('turf_v3', JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1, gps: 1 }, n: [5, 2], av: 2, xp: 2400, loops: window.__first ? 0 : 6, ll: [35.6852, 139.77], newsSeen: '9.9.9', lastDay: '2026-10-15', c: window.__own || [] }));
  });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url();
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
    if (u.includes('reverse-geocoder')) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"results":{"muniCd":"13102"}}' }); // 地名は東京都中央区として答える
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await sleep(2000);
  await p.evaluate(() => { document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')); document.getElementById('btnGo').click(); }); await sleep(800);
  await p.evaluate(() => document.querySelectorAll('.modal.show,.coach').forEach((m) => m.classList ? m.classList.remove('show') : 0));
  const pts = []; const la0 = 35.6852, lo0 = 139.77, d = 0.0018;
  for (let i = 0; i <= 12; i++) pts.push([la0 + d * i / 12, lo0]);
  for (let i = 1; i <= 12; i++) pts.push([la0 + d, lo0 + d * 1.2 * i / 12]);
  for (let i = 1; i <= 10; i++) pts.push([la0 + d - d * i / 12, lo0 + d * 1.2]);
  if (process.env.FIRST === 'loop') { for (let i = 1; i <= 14; i++) pts.push([35.6852 + 0.0018 / 6 - (0.0018 / 6) * i / 14, 139.77 + 0.0018 * 1.2 - 0.0018 * 1.2 * i / 14]); }
  else if (process.env.FIRST) pts.splice(8);
  for (const [a, b] of pts) { await p.evaluate((a, b) => window.__fix(a, b), a, b); await sleep(120); }
  await sleep(process.env.FIRST === 'loop' ? 400 : 1200);
  console.log(await p.evaluate(() => { const g = document.querySelector('path.ghost'), r = document.querySelector('path.route'); return [g && g.getBoundingClientRect().toJSON(), r && r.getAttribute('d').slice(0, 80), typeof map]; }));
  console.log(await p.evaluate(() => ({ ghost: !!document.querySelector('path.ghost'), guide: document.getElementById('guide').innerText })));
  await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'))); await sleep(400);
  await p.evaluate(() => { try { const r = document.querySelector('path.route').getBoundingClientRect(), mp = document.querySelector('.leaflet-map-pane'), m = mp.style.transform.match(/(-?[\d.]+)px, (-?[\d.]+)px/); mp.style.transform = 'translate3d(' + (+m[1] + 187 - (r.x + r.width / 2)) + 'px,' + (+m[2] + 360 - (r.y + r.height / 2)) + 'px,0)'; } catch (e) { console.log(e.message); } }); await sleep(600);
  console.log(await p.evaluate(() => [document.querySelector('.leaflet-container').getBoundingClientRect().toJSON(), document.querySelector('.leaflet-map-pane').style.transform, document.querySelector('.leaflet-overlay-pane svg').getAttribute('style'), document.querySelector('.me') && document.querySelector('.me').getBoundingClientRect().y]));
  console.log(await p.evaluate(() => [(document.querySelector('path.ghost') || { getBoundingClientRect: () => ({ toJSON: () => null }) }).getBoundingClientRect().toJSON(), document.querySelector('path.route').getBoundingClientRect().toJSON()]));
  if (process.env.IMGS) console.log(await p.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src.slice(0, 120) + ' ' + i.className)));
  await p.screenshot({ path: path.join(OUT, process.env.FIRST ? 'ghost_first.png' : process.env.OWN ? 'ghost_own.png' : 'ghost.png') });
  if (process.env.RESULT) { // 囲んでから終えたときの記録（県の割合の行）
    await sleep(3500); await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')));
    await p.evaluate(() => { document.getElementById('btnGo').click(); }); await sleep(2500);
    console.log(await p.evaluate(() => document.getElementById('rArea').innerText));
    await p.screenshot({ path: path.join(OUT, 'ghost_result.png') });
  }
  if (process.env.PAUSE) { // 囲まずに一時停止したときのリザルト
    await p.evaluate(() => document.getElementById('btnGo').click()); await sleep(700);
    await p.screenshot({ path: path.join(OUT, 'ghost_end.png') }); // 囲めそうなのに終わろうとしたときの確認
    await p.evaluate(() => document.getElementById('endStop').click()); await sleep(1800);
    console.log(await p.evaluate(() => document.getElementById('rArea').innerText));
    await p.screenshot({ path: path.join(OUT, 'ghost_pause.png') });
  }
  await br.close(); srv.close();
});
