// 主な画面（待機中の地図・ミッション・設定・戦績・Pro）を小さい画面（375x667）で撮る（CX点検用）
// 使い方: cd game && node tools/shot-screens.js 出力フォルダ
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
  await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')));
  const cut = async (nm) => { if (process.env.CUT) console.log('cut', nm, await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || !e.childElementCount && !e.textContent.trim()) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false; return e.scrollWidth > e.clientWidth + 1 && (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && e.clientWidth > 0 && !/leaflet|scroll|tabs|slider|pane|sl/.test(e.className + ''); }).map((e) => (e.id || e.className + '') + ':' + e.textContent.trim().slice(0, 30)).slice(0, 15))); };
  await cut('home');
  if (process.env.A11Y) console.log('a11y', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button,[role=button],a')].filter((b) => b.getAttribute('aria-hidden') !== 'true' && !(b.getAttribute('aria-label') || b.textContent.trim() || b.title)).map((b) => (b.id || b.className || b.tagName) + ''))));
  if (process.env.TODAYFIT) console.log('today', await p.evaluate(() => [...document.querySelectorAll('.today b,.today small')].map((e) => e.textContent + (e.scrollWidth > e.clientWidth ? ' ✗切れ' : ' ○'))));
  await p.screenshot({ path: path.join(OUT, 'sc_home.png') });
  const shots = [['sc_missions', "document.getElementById('btnMissions')"], ['sc_settings', "document.getElementById('btnSettings')"], ['sc_profile', "document.getElementById('rankCard')"]];
  for (const [name, sel] of shots) {
    await p.evaluate((s) => { const e = eval(s); if (e) e.click(); }, sel); await sleep(900);
    await cut(name);
    if (process.env.ACHNX && name === 'sc_profile') { await p.evaluate(() => { const e = document.querySelector('.achnx'); if (e) e.scrollIntoView({ block: 'center' }); }); await sleep(400); await p.screenshot({ path: path.join(OUT, 'sc_achnx.png') }); await p.evaluate(() => { const e = document.querySelector('.achs'); if (e) e.scrollIntoView({ block: 'start' }); }); await sleep(400); await p.screenshot({ path: path.join(OUT, 'sc_achs.png') }); await p.evaluate(() => document.querySelector('.ach[data-ach="c100"]').click()); await sleep(600); console.log('achtap', await p.evaluate(() => document.getElementById('toast').textContent)); await sleep(3500); await p.evaluate(() => document.querySelector('.skin[data-skin="violet"]').click()); await sleep(600); console.log('skintap', await p.evaluate(() => document.getElementById('toast').textContent)); await p.screenshot({ path: path.join(OUT, 'sc_achtap.png') }); }
    if (process.env.SHEETTEXT) console.log('text', name, await p.evaluate(() => { const sh = document.querySelector('.sheet.show'); return sh ? sh.innerText.split(String.fromCharCode(10)).map((t) => t.trim()).filter(Boolean).join(' | ').slice(0, 2500) : ''; }));
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    await p.evaluate(() => { if (window.closeSheet) closeSheet(); document.querySelectorAll('.sheet.show').forEach((m) => m.classList.remove('show')); document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')); }); await sleep(500);
  }
  if (process.env.NAMEROW) { // 設定の「名前・アイコン」から名前の変更が開くか
    await p.evaluate(() => document.getElementById('btnSettings').click()); await sleep(900);
    await p.evaluate(() => document.getElementById('sName').click()); await sleep(2200);
    console.log('namerow', await p.evaluate(() => ({ rank: !!document.querySelector('#shRank.show'), pick: !document.getElementById('namePick').hidden })));
    await p.screenshot({ path: path.join(OUT, 'sc_namerow.png') });
  }
  await br.close(); srv.close();
});
