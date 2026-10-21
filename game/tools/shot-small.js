// 小さい画面（iPhone SE 375x667）で、歩いた後のリザルト・ランキング・名前とアイコンの画面を撮る（はみ出し確認用）
// 使い方: cd game && node tools/shot-small.js 出力フォルダ
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const top = []; for (let i = 0; i < 30; i++) top.push({ rank: i + 1, name: ['疾風の忍者', '江戸川の虎', '謎の狐'][i % 3], lv: 20 - (i >> 2), v: 500 - i * 9, me: i === 8, h: i === 8 ? null : ('00000000000' + i.toString(16)).slice(-12), av: i % 2 ? i % 30 : null, ac: i % 10 });
const RANK = { kind: 'week', week: 'w', total: 120, top, me: { rank: 9, name: '江戸川の虎', lv: 12, v: 428, next: 437 } };
const srv = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  const ext = path.extname(f); w.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await br.newPage(); await p.setViewport({ width: +(process.env.W || 375), height: +(process.env.H || 667), deviceScaleFactor: 2 }); await p.evaluateOnNewDocument((b) => { window.__big = b; }, !!process.env.BIG);
  await p.evaluateOnNewDocument(() => { localStorage.setItem('turf_v3', JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 }, n: [5, 2], av: 0, ac: 4, xp: 900, newsSeen: '9.9.9', big: !!window.__big })); });
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url();
    if (u.includes('/api/rank')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(RANK) });
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 1500));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 一周歩いて一時停止 → リザルト
  await p.evaluate(() => { const c = [35.685, 139.77], R = 0.0012, pts = [];
    for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; pts.push([c[0] + R * Math.sin(a), c[1] + R * 1.23 * Math.cos(a)]); }
    navigator.geolocation.watchPosition = (ok) => { pts.forEach((q, i) => ok({ coords: { latitude: q[0], longitude: q[1], accuracy: 8 }, timestamp: Date.now() + i * 12000 })); return 1; };
    navigator.geolocation.clearWatch = () => {}; document.getElementById('btnGo').click(); });
  await sleep(1500); await p.evaluate(() => { document.querySelectorAll('.modal.show').forEach((m) => { if (m.id !== 'resModal') m.classList.remove('show'); }); document.getElementById('btnGo').click(); });
  await sleep(2500);
  const res = await p.evaluate(() => { const m = document.querySelector('#resModal .mcard') || document.getElementById('resModal'); const r = m.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight, sh: m.scrollHeight, ch: m.clientHeight }; });
  console.log('result', JSON.stringify(res));
  await p.screenshot({ path: path.join(OUT, 'small_result.png') });
  if (process.env.SHARE) { // 領地カードの画面
    await p.evaluate(() => document.getElementById('rShare').click()); await sleep(3500);
    console.log('share', await p.evaluate(() => { const m = document.querySelector('#shareModal .mcard'); const r = m && m.getBoundingClientRect(); return r && { top: r.top, bottom: r.bottom, sh: m.scrollHeight, ch: m.clientHeight }; }));
    await p.screenshot({ path: path.join(OUT, 'small_share.png') });
    await p.evaluate(() => document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')));
  }
  await p.evaluate(() => document.getElementById('rClose').click()); await sleep(800);
  await p.evaluate(() => { document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show')); document.getElementById('btnRank').click(); }); await sleep(1500);
  await p.screenshot({ path: path.join(OUT, 'small_rank.png') });
  await p.evaluate(() => document.getElementById('reroll').click()); await sleep(600);
  const np = await p.evaluate(() => { const e = document.getElementById('namePick'); return { sh: e.scrollHeight, ch: e.clientHeight }; });
  console.log('namePick', JSON.stringify(np));
  await p.screenshot({ path: path.join(OUT, 'small_name.png') });
  await br.close(); srv.close();
});
