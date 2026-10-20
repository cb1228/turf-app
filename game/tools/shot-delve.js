// DEEP DELVE（2Dダンジョン）の試作をスマホ幅とPC幅で動かして撮る（エラーと見た目の点検）
// 使い方: cd game && node tools/shot-delve.js 出力フォルダ
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = path.join(__dirname, '..', '..', 'site'), OUT = process.argv[2] || '.';
const srv = http.createServer((q, w) => { const fp = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  w.writeHead(200, { 'Content-Type': fp.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); fs.createReadStream(fp).pipe(w);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: require('os').tmpdir() + '/delve-' + Date.now() });
  for (const [name, vw, vh, touch] of [['phone', 844, 390, true], ['pc', 1280, 760, false]]) {
    const p = await br.newPage(); await p.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
    p.on('pageerror', (e) => console.log('ERR', name, e.message));
    await p.goto(base + '/delve.html'); await sleep(600);
    await p.screenshot({ path: path.join(OUT, 'delve_' + name + '_title.png') });
    p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', name, m.text().slice(0, 200)); });
    await p.evaluate(() => window.__delve.start(innerWidth < 900 ? 'war' : 'mag'));
    // 少し歩いて攻撃
    for (const k of ['d', 'd', 's', 'a', 'w']) { await p.keyboard.down(k); await sleep(500); await p.keyboard.up(k); }
    // 自動で遊ぶ: 近い敵の横へ寄って攻撃 → 階段で降りる、を5階（主の階）まで
    await p.keyboard.down(' ');
    for (let f = 0; f < 5; f++) {
      for (let i = 0; i < 6; i++) { await p.evaluate(() => { const D = window.__delve, P = D.P(), e = D.list().filter((x) => x.k !== 'mimic' || x.awake)[0]; if (e) { P.x = e.x - 0.6; P.y = e.y; P.face = 0; P.hp = P.max; } }); await sleep(500); }
      const st = await p.evaluate(() => { const D = window.__delve, s = D.stairs(); return { floor: D.floor(), locked: !!s.locked, boss: D.list().some((e) => e.k === 'boss'), kills: D.kills(), lv: D.P().lv }; });
      console.log(name, 'B' + st.floor + 'F', JSON.stringify(st));
      if (st.locked) { for (let i = 0; i < 30 && await p.evaluate(() => window.__delve.list().some((e) => e.k === 'boss')); i++) { await p.evaluate(() => { const D = window.__delve, P = D.P(), e = D.list().find((x) => x.k === 'boss'); if (e) { P.x = e.x - 0.9; P.y = e.y; P.face = 0; P.hp = P.max; P.st.str = 80; } }); await sleep(400); } }
      if (f === 4) { await sleep(300); await p.screenshot({ path: path.join(OUT, 'delve_' + name + '_boss.png') }); }
      await p.evaluate(() => { const D = window.__delve, P = D.P(), s = D.stairs(); P.x = s.x + 0.5; P.y = s.y + 0.5; }); await sleep(400);
      console.log(name, 'after-stairs', JSON.stringify(await p.evaluate(() => { const D = window.__delve, P = D.P(), s = D.stairs(); return { f: D.floor(), px: P.x, py: P.y, sx: s.x, sy: s.y, hp: P.hp, inv: !document.getElementById('sheet').hidden, dead: !document.getElementById('dead').hidden }; })));
    }
    await p.keyboard.up(' ');
    await sleep(300); await p.screenshot({ path: path.join(OUT, 'delve_' + name + '_play.png') });
    await p.evaluate(() => { window.__delve.inv(); const b = document.querySelector('#grid .it'); if (b) b.click(); }); await sleep(300);
    await p.screenshot({ path: path.join(OUT, 'delve_' + name + '_inv.png') });
    await p.evaluate(() => window.__delve.sheet('stat')); await sleep(200); await p.screenshot({ path: path.join(OUT, 'delve_' + name + '_stat.png') });
    await p.evaluate(() => window.__delve.close());
    console.log(name, JSON.stringify(await p.evaluate(() => { const P = window.__delve.P(); return { hp: P.hp, lv: P.lv, floor: window.__delve.floor(), ents: window.__delve.list().length }; })));
  }
  await br.close(); srv.close();
});
