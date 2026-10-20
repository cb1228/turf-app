// ランキング画面を、参加者が多い想定（100人＋自分が57位）でスマホ幅に描いて撮る（見た目の確認用）
// 使い方: cd game && node tools/shot-rank.js 出力.png
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.argv[2] || 'rank.png', SCROLL = Number(process.argv[3] || 0);
const PRE = ['疾風の', '無敵の', '深夜の', '雷鳴の', '伝説の', '迷子の'], NOUN = ['忍者', '侍', '狐', '龍', '虎', '姫'];
const top = []; for (let i = 0; i < 100; i++) top.push({ rank: i + 1, name: i === 56 ? '謎の狐' : PRE[i % 6] + NOUN[(i * 7) % 6], lv: 30 - Math.floor(i / 4), v: 900 - i * 8, me: i === 56, h: i === 56 ? null : ('00000000000' + i.toString(16)).slice(-12), av: i % 3 === 1 ? null : (i * 7) % 30, ac: i % 10 });
const RANK = { kind: 'week', week: 'w', total: 340, top, me: { rank: 57, name: '謎の狐', lv: 16, v: 900 - 56 * 8, next: 900 - 55 * 8 } };
const srv = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  const ext = path.extname(f); w.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await br.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('turf_v3', JSON.stringify({ onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 }, n: [5, 2], av: 0, ac: 4, xp: 900, newsSeen: '9.9.9' })); });
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url();
    if (u.includes('/api/rank')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(RANK) });
    if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.startsWith(base)) return r.continue();
    return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html', { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate(() => document.getElementById('btnRank').click()); await new Promise((r) => setTimeout(r, 1500));
  if (process.argv[4] === 'name') { await p.evaluate(() => document.getElementById('reroll').click()); await new Promise((r) => setTimeout(r, 500)); }
  if (process.argv[4] === 'act') { await p.evaluate(() => document.querySelector('#rkList [data-h]').click()); await new Promise((r) => setTimeout(r, 500)); }
  if (SCROLL) { await p.evaluate((y) => { document.getElementById('rkList').scrollTop = y; }, SCROLL); await new Promise((r) => setTimeout(r, 400)); }
  const info = await p.evaluate(() => { const b = document.getElementById('rkList'); return { rows: b.querySelectorAll('.rrow').length, sh: b.scrollHeight, ch: b.clientHeight }; });
  console.log(JSON.stringify(info));
  await p.screenshot({ path: OUT }); await br.close(); srv.close();
});
