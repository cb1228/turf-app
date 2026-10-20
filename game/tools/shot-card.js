// 領地カード（シェア画像 1080x1920）を ?shot=card で作らせて、そのまま画像に保存する（見た目の点検用）
// 使い方: cd game && node tools/shot-card.js 出力フォルダ   （PRO=1 で金縁）
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const srv = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  w.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: require('os').tmpdir() + '/turf-shot-' + Date.now() });
  const p = await br.newPage(); await p.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(base + '/turf.html?shot=card', { waitUntil: 'domcontentloaded' }); await sleep(5000);
  const src = await p.evaluate(() => { const i = document.getElementById('shareImg'); return i && i.src; });
  if (src && src.startsWith('data:image')) { fs.writeFileSync(path.join(OUT, 'card.png'), Buffer.from(src.split(',')[1], 'base64')); console.log('saved card.png'); }
  else { await p.screenshot({ path: path.join(OUT, 'card.png') }); console.log('screenshot', String(src).slice(0, 40)); }
  await br.close(); srv.close();
});
