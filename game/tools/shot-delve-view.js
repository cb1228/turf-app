// DEEP DELVE の通常プレイ画面（入ってすぐ・敵の近く）を横画面スマホとPCで撮る（見た目の点検用）
// 使い方: cd game && node tools/shot-delve-view.js 出力フォルダ [職業]
const http = require('http'), fs = require('fs'), path = require('path'); const puppeteer = require('puppeteer-core');
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.', CLS = process.argv[3] || 'war';
const srv = http.createServer((q, w) => { const fp = path.join(SITE, decodeURIComponent(q.url.split('?')[0])); if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  w.writeHead(200, { 'Content-Type': fp.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); fs.createReadStream(fp).pipe(w); }).listen(0, '127.0.0.1', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: require('os').tmpdir() + '/dv-' + Date.now() });
  for (const [name, w, h, touch] of [['phone', 844, 390, true], ['pc', 1280, 760, false]]) {
    const p = await br.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
    p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 160)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/delve.html`); await sleep(800);
    await p.screenshot({ path: path.join(OUT, 'v_' + name + '_title.png') });
    await p.evaluate((c) => window.__delve.start(c), CLS); await sleep(2600);
    // 一番近い敵の 2マス手前まで寄せる（戦っている絵を撮る）
    await p.evaluate(() => { const D = window.__delve, P = D.P(), G = D.G(); const e = G.ents.filter((x) => x.k !== 'shop').sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0]; if (e) { for (const [dx, dy] of [[-1.6, .3], [1.6, .3], [0, 1.6], [0, -1.6], [-1, 1], [1, 1]]) { const tx = Math.floor(e.x + dx), ty = Math.floor(e.y + dy); if (G.map[ty] && G.map[ty][tx] === 0) { P.x = tx + .5; P.y = ty + .5; break; } } } });
    await sleep(900); await p.evaluate(() => { window.__delve.P().inv = 0; }); await sleep(40); await p.screenshot({ path: path.join(OUT, 'v_' + name + '_play.png') });
  }
  await br.close(); srv.close(); });
