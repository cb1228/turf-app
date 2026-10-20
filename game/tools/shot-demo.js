// ?demo（宣伝動画の録画用デモ）で、歩いている途中の「戻れば領地になる形」が出るかを小さい画面で撮る
// 使い方: cd game && node tools/shot-demo.js 出力フォルダ
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
  await p.setRequestInterception(true);
  p.on('request', (r) => { const u = r.url(); if (u.startsWith(base) || /arcgisonline|unpkg|cdnjs|jsdelivr/.test(u)) return r.continue(); return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
  await p.goto(base + '/turf.html?demo', { waitUntil: 'domcontentloaded' });
  for (const t of [5000, 3000, 3200]) { await sleep(t); console.log(await p.evaluate(() => [...document.querySelectorAll('.leaflet-overlay-pane path')].map((e) => e.getAttribute('class')).join('|'))); await p.evaluate(() => { const r = document.querySelector('path.route').getBoundingClientRect(), mp = document.querySelector('.leaflet-map-pane'), m = mp.style.transform.match(/(-?[\d.]+)px, (-?[\d.]+)px/); if (r.width && m) mp.style.transform = 'translate3d(' + (+m[1] + 187 - (r.x + r.width / 2)) + 'px,' + (+m[2] + 330 - (r.y + r.height / 2)) + 'px,0)'; });
    await p.screenshot({ path: path.join(OUT, 'demo_' + t + '.png') }); }
  await br.close(); srv.close();
});
