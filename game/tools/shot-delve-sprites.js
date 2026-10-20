// DEEP DELVE の 64x64 ドット絵（職業9＋魔物）を一覧にして撮る（絵の点検用）
// 使い方: cd game && node tools/shot-delve-sprites.js 出力.png
const http = require('http'), fs = require('fs'), path = require('path'); const puppeteer = require('puppeteer-core');
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || 'sprites.png';
const srv = http.createServer((q, w) => { const fp = path.join(SITE, decodeURIComponent(q.url.split('?')[0])); if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  w.writeHead(200, { 'Content-Type': fp.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); fs.createReadStream(fp).pipe(w); }).listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: require('os').tmpdir() + '/ds-' + Date.now() });
  const p = await br.newPage(); await p.setViewport({ width: 1200, height: 520 }); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/delve.html`); await new Promise((r) => setTimeout(r, 700));
  await p.evaluate(() => { const A = window.DD.ART, c = document.createElement('canvas'); c.width = 1200; c.height = 520; c.style.cssText = 'position:fixed;inset:0;z-index:99;background:#2a2234'; document.body.appendChild(c); const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    Object.keys(A.HEROS).forEach((k, i) => { x.drawImage(A.HEROS[k][0], 10 + i * 130, 10, 128, 128); x.drawImage(A.HEROS[k][1], 10 + i * 130, 140, 64, 64); });
    ['rat', 'spider', 'slime', 'gnome', 'gob', 'skel', 'scorp', 'ghoul', 'imp', 'troll', 'golem', 'mimic', 'chest', 'mino', 'boss', 'shop', 'boulder'].forEach((k, i) => { x.drawImage(A.SPR[k][0], 10 + (i % 9) * 130, 220 + Math.floor(i / 9) * 150, 128, 128); }); });
  await p.screenshot({ path: OUT }); await br.close(); srv.close(); });
