// じんとり散歩の画面全体の自動点検（スモークテスト）。本物の site/turf.html をブラウザで動かし、/api/* は試験用の偽サーバーで代用する。
// 使い方: cd game && node tests/smoke.js   （Chrome のパスは環境変数 CHROME で変更可）
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const SITE = path.join(__dirname, '..', '..', 'site');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC = fs.readFileSync(path.join(SITE, 'turf.html'), 'utf8');
const results = []; const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 静的チェック ----
{ const bad = [...SRC].map((c, i) => [c.charCodeAt(0), i]).filter(([c]) => c < 32 && c !== 10 && c !== 13 && c !== 9);
  check('ソースに制御文字がない', bad.length === 0, bad.slice(0, 3)); }
{ // body に付ける状態クラスが、単独クラスのCSS（.x{ や .x,）と衝突していないか
  const bodyCls = new Set(); for (const m of SRC.matchAll(/document\.body\.classList\.(?:add|toggle|remove)\('([\w-]+)'/g)) bodyCls.add(m[1]);
  for (const m of SRC.matchAll(/\bb\.toggle\('([\w-]+)'/g)) bodyCls.add(m[1]);
  const css = SRC.slice(SRC.indexOf('<style>'), SRC.indexOf('</style>'));
  const clash = [...bodyCls].filter((c) => new RegExp('(^|[\\s,}])\\.' + c + '(?=[\\s,{:.\\[])', 'm').test(css.replace(new RegExp('body\\.' + c, 'g'), '')));
  check('body の状態クラスが既存の見た目と衝突しない', clash.length === 0, { bodyClasses: [...bodyCls], clash }); }

// ---- 試験用の偽サーバー（/api/*）----
const ERRS = [];
const REPORTS = [], PICS = [];
function fakeApi() {
  const P = {}, FC = {}, FR = [], XF = {};
  const body = (s) => JSON.stringify(s);
  return (url, method, data) => {
    const u = new URL(url), p = u.pathname, d = data ? JSON.parse(data) : {};
    if (p === '/api/score') { P[d.id] = P[d.id] || { tok: d.tok }; if (P[d.id].tok !== d.tok) return [403, body({ error: 'forbidden' })]; Object.assign(P[d.id], d); return [200, body({ ok: true })]; }
    if (p === '/api/rank') { const me = P[u.searchParams.get('id')] || {}; return [200, body({ kind: u.searchParams.get('kind'), week: 'w', total: 2, top: [{ rank: 1, name: '疾風の忍者', lv: 9, v: 300, me: false, h: 'a1b2c3d4e5f6' }, { rank: 2, name: me.cn || '謎の狐', lv: 4, v: 120, me: true, h: null }], me: { rank: 2, v: 120, cn: me.cn || null, pv: me.pv || null } })]; }
    if (p === '/api/name') { if (!P[d.id] || P[d.id].tok !== d.tok) return [403, body({ error: 'forbidden' })]; if (/しね/.test(d.name)) return [200, body({ error: 'ng' })]; P[d.id].cn = d.name || null; return [200, body({ ok: true, name: d.name || null })]; }
    if (p === '/api/pic') { if (!P[d.id] || P[d.id].tok !== d.tok) return [403, body({ error: 'forbidden' })]; PICS.push(d.img.length); P[d.id].pv = d.img ? 123 : null; return [200, body(d.img ? { ok: true, pv: 123 } : { ok: true, pv: null })]; }
    if (p === '/api/staff') { if (!P[d.id] || P[d.id].tok !== d.tok) return [403, body({ error: 'forbidden' })]; P[d.id].st = !!d.on; return [200, body({ ok: true, staff: !!d.on })]; }
    if (p === '/api/report') { REPORTS.push(d.h); return [200, body({ ok: true, hidden: false })]; }
    if (p === '/api/season') return [200, body({ mo: '2026-08', total: 0, top: [], me: null })];
    if (p === '/api/friend/code') { FC[d.id] = FC[d.id] || 'ABCD23'; return [200, body({ code: FC[d.id] })]; }
    if (p === '/api/friends') return [200, body({ week: 'w', count: 1, max: 30, list: [{ name: '月夜の姫', lv: 8, v: 200, me: false, fi: 0, rank: 1 }, { name: '謎の狐', lv: 4, v: 120, me: true, fi: null, rank: 2 }] })];
    if (p === '/api/xfer/put') { if (!P[d.id] || P[d.id].tok !== d.tok) return [403, body({ error: 'forbidden' })]; XF[d.k] = d.blob; return [200, body({ ok: true, exp: Date.now() + 864e5 })]; }
    if (p === '/api/xfer/get') { const b = XF[d.k]; delete XF[d.k]; return [200, body(b ? { ok: true, blob: b } : { error: 'notfound' })]; }
    if (p === '/api/rekey') { if (!P[d.id] || P[d.id].tok !== d.tok) return [403, body({ error: 'forbidden' })]; P[d.id].tok = d.ntok; return [200, body({ ok: true })]; }
    if (p === '/api/err') { ERRS.push(d); return [200, body({ ok: true })]; }
    if (p === '/api/delete') { delete P[d.id]; return [200, body({ ok: true })]; }
    return [404, body({ error: 'not found' })];
  };
}

function serve() { return new Promise((res) => { const s = http.createServer((q, w) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/turf.html'; const fp = path.join(SITE, f);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); }
  const ext = path.extname(f); w.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(w); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`, api = fakeApi();
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });
  async function open(q, state, pre) {
    const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 390, height: 844 });
    if (pre) await p.evaluateOnNewDocument(pre);
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.setRequestInterception(true);
    p.on('request', (r) => { const u = r.url();
      if (u.startsWith(base + '/api/')) { const [st, b] = api(u, r.method(), r.postData()); return r.respond({ status: st, contentType: 'application/json', body: b }); }
      if (u.startsWith(base)) return r.continue();
      if (u.includes('reverse-geocoder')) return r.respond({ status: 200, contentType: 'application/json', body: '{"results":{"muniCd":"13102"}}' });
      return r.respond({ status: 200, contentType: 'text/plain', body: '' }); });
    await p.goto(base + '/turf.html' + (q || ''), { waitUntil: 'domcontentloaded' });
    if (state !== undefined) { await p.evaluate((s) => { localStorage.clear(); if (s) localStorage.setItem('turf_v3', JSON.stringify(s)); }, state); await p.reload({ waitUntil: 'domcontentloaded' }); }
    await sleep(700); return { p, ctx, errs };
  }
  const visible = (p) => p.evaluate(() => { const b = document.getElementById('btnGo').getBoundingClientRect(); return getComputedStyle(document.body).display !== 'none' && b.height > 30 && b.width > 80; });
  const DONE = { onb: true, tut: { walk: 1, loop: 1, chest: 1, rank: 1, mission: 1 } };

  // 1. 初回起動
  { const { p, ctx, errs } = await open('', null); const onb = await p.evaluate(() => !document.getElementById('onb').classList.contains('hide'));
    check('初回はオンボーディングが出る', onb); check('初回起動でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 2. シート・タブ・設定
  { const { p, ctx, errs } = await open('', DONE);
    check('通常画面が表示される', await visible(p));
    const ax = await p.evaluate(() => ({ hiddenModal: getComputedStyle(document.getElementById('proModal')).visibility, hiddenSheet: getComputedStyle(document.getElementById('shSettings')).visibility,
      unlabeled: [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && b.id !== 'rival').length, toast: document.getElementById('toast').getAttribute('aria-live') }));
    check('読み上げ: 閉じた画面は対象外・アイコンだけのボタンに名前・お知らせを読み上げ', ax.hiddenModal === 'hidden' && ax.hiddenSheet === 'hidden' && ax.unlabeled === 0 && ax.toast === 'polite', ax);
    const sheets = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      const open = async (btn, body) => { document.getElementById(btn).click(); await w(500); const el = document.getElementById(body); out[btn] = el && el.innerText.trim().length; document.getElementById('backdrop').click(); await w(300); };
      await open('btnMissions', 'misBody'); await open('rankCard', 'profBody'); await open('btnSettings', 'setBody');
      document.getElementById('btnRank').click(); await w(400);
      for (const k of ['week', 'local', 'month', 'all', 'friends']) { document.querySelector('#rkSeg button[data-k=' + k + ']').click(); await w(500); out['rank_' + k] = document.getElementById('rkList').innerText.trim().length; }
      out.bad = (document.body.innerText.match(/NaN|undefined/g) || []).length; document.getElementById('backdrop').click(); return out; });
    check('画面のどこにも NaN / undefined が出ない', sheets.bad === 0, sheets.bad); delete sheets.bad;
    check('全シートとランキング5タブに中身がある', Object.values(sheets).every((n) => n > 5), sheets);
    const a11y = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); document.getElementById('btnSettings').click(); await w(400);
      for (const id of ['sBig', 'sCvd', 'sCalm']) { document.getElementById(id).click(); await w(200); } const cls = document.body.className; document.getElementById('backdrop').click(); await w(300); return cls; });
    check('見やすさ3設定をONにできる', /big/.test(a11y) && /calm/.test(a11y), a11y);
    check('見やすさ設定をONにしても画面が消えない', await visible(p));
    check('シート・設定操作でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 3. 一周して囲む → リザルト・領地カード
  { const { p, ctx, errs } = await open('', DONE);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), pts = [];
      for (let i = 0; i <= 64; i++) { const a = i / 60 * 2 * Math.PI; pts.push([35.685 + 0.0022 * Math.sin(a), 139.77 + 0.0027 * Math.cos(a)]); }
      navigator.geolocation.watchPosition = (ok) => { pts.forEach((q, i) => ok({ coords: { latitude: q[0], longitude: q[1], accuracy: 8 }, timestamp: Date.now() + i * 20000 })); return 1; };
      navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); await w(300); document.querySelectorAll('.modal').forEach((m) => m.classList.remove('show'));
      document.getElementById('btnGo').click(); await w(1200);
      const res = document.getElementById('resModal').classList.contains('show'), cells = document.getElementById('rCells').textContent;
      const bad = (document.getElementById('resModal').innerText.match(/NaN|undefined|null/g) || []);
      document.getElementById('rShare').click(); await w(3500);
      return { bad, loops: JSON.parse(localStorage.getItem('turf_v3')).loops, res, cells, card: (document.getElementById('shareImg').src || '').length }; });
    check('リザルト画面に NaN / undefined が出ない', r.bad.length === 0, r.bad);
    check('一周すると囲める', r.loops >= 1, r); check('一時停止でリザルト画面が出る', r.res, r.cells); check('領地カードが生成される', r.card > 10000, r.card);
    check('歩行・囲み・カードでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4. 機種変更の引き継ぎ（発行 → 別の端末で復元）
  { const A = await open('', Object.assign({ xp: 777, c: ['465890,118937', '465891,118937'] }, DONE));
    const code = await A.p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); document.getElementById('btnSettings').click(); await w(300);
      document.getElementById('sXfer').click(); await w(300); document.getElementById('xIssue').click(); for (let i = 0; i < 40 && !document.querySelector('.xcode'); i++) await w(250);
      return (document.querySelector('.xcode') || {}).textContent; });
    const B = await open('', DONE);
    await B.p.evaluate(async (code) => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); document.getElementById('btnSettings').click(); await w(300);
      document.getElementById('sXfer').click(); await w(300); document.getElementById('xIn').value = code; document.getElementById('xGo').click(); }, code);
    await B.p.waitForNavigation({ timeout: 15000 }).catch(() => {}); await sleep(600); // 復元後にアプリが自動で再読み込みする
    const got = await B.p.evaluate(() => { const s = JSON.parse(localStorage.getItem('turf_v3')); return { xp: s.xp, cells: (s.c || []).length }; });
    check('引き継ぎコードで記録が移る', got && got.xp === 777 && got.cells === 2, { code, got });
    check('引き継ぎでエラーなし', A.errs.length + B.errs.length === 0, A.errs.concat(B.errs)); await A.ctx.close(); await B.ctx.close(); }
  // 4b. Proパック（Web版は買えない表示 → 偽のApp Storeで購入 → 限定スキン・入れ替え・金縁カード）
  { const { p, ctx, errs } = await open('', DONE);
    const web = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); document.getElementById('btnSettings').click(); await w(300);
      document.getElementById('sPro').click(); await w(400); const b = document.getElementById('proBuy');
      return { show: document.getElementById('proModal').classList.contains('show'), dis: b.disabled, t: b.textContent }; });
    check('Web版のProは「アプリ版で購入」表示で買えない', web.show && web.dis && /アプリ版/.test(web.t), web);
    check('Web版のPro画面でエラーなし', errs.length === 0, errs); await ctx.close(); }
  { const fakeStore = () => { let owned = false; const h = {};
      const product = { id: 'com.himori.jintori.pro', canPurchase: true, pricing: { price: '¥850' }, get owned() { return owned; }, getOffer() { return { id: 'o' }; } };
      const when = { productUpdated(f) { h.pu = f; return when; }, approved(f) { h.ap = f; return when; }, finished(f) { h.fi = f; return when; } };
      window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
      window.CdvPurchase = { ProductType: { NON_CONSUMABLE: 'nc' }, Platform: { APPLE_APPSTORE: 'ios' }, ErrorCode: { PAYMENT_CANCELLED: 6777006 },
        store: { register() {}, when: () => when, error() {}, get: () => product, owned: () => owned, restorePurchases: () => Promise.resolve(),
          initialize() { setTimeout(() => h.pu(product), 10); return Promise.resolve([]); },
          order() { setTimeout(() => { owned = true; const t = { products: [{ id: product.id }], finish() { h.fi(t); } }; h.ap(t); }, 50); return Promise.resolve(undefined); } } }; };
    const { p, ctx, errs } = await open('', DONE, fakeStore); await sleep(1200); // App Store の商品情報が届くのを待つ
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      document.getElementById('btnSettings').click(); await w(300); document.getElementById('sPro').click(); await w(1500);
      const b = document.getElementById('proBuy'); out.btn = b.textContent; out.enabled = !b.disabled; b.click(); await w(800);
      out.pro = JSON.parse(localStorage.getItem('turf_v3')).pro; document.querySelectorAll('.modal').forEach((m) => m.classList.remove('show'));
      document.getElementById('rankCard').click(); await w(400); document.querySelector('[data-skin=rainbow]').click(); await w(300);
      out.skin = JSON.parse(localStorage.getItem('turf_v3')).skin; document.getElementById('backdrop').click(); await w(300);
      document.getElementById('btnMissions').click(); await w(400); const sw = document.querySelector('[data-swap]'); out.swapBtn = !!sw; if (sw) sw.click(); await w(300);
      out.mswap = !!JSON.parse(localStorage.getItem('turf_v3')).mswap; out.swapLeft = document.querySelectorAll('[data-swap]').length; return out; });
    check('アプリ版でProを買える（価格表示→購入→保存）', r.enabled && /850/.test(r.btn) && r.pro === 1, r);
    check('Pro購入後は限定スキンを選べる', r.skin === 'rainbow', r);
    check('Proのミッション入れ替えは1日1回', r.swapBtn && r.mswap && r.swapLeft === 0, r);
    check('Pro購入まわりでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4c. お知らせ（アプリ版だけ・端末内の予約）
  { const fakeLN = () => { window.__ln = { sched: [], cancels: 0 };
      window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {
        requestPermissions: () => Promise.resolve({ display: 'granted' }), cancel: () => { window.__ln.cancels++; return Promise.resolve(); },
        schedule: (o) => { window.__ln.sched.push(o.notifications.map((n) => ({ id: n.id, body: n.body, at: n.schedule.at.toISOString(), h: n.schedule.at.getHours(), dow: n.schedule.at.getDay() }))); return Promise.resolve(); } } } }; };
    const { p, ctx, errs } = await open('', Object.assign({ ll: [35.685, 139.77] }, DONE), fakeLN);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      document.getElementById('btnSettings').click(); await w(300); out.row = !!document.getElementById('sNtf');
      document.getElementById('sNtf').click(); await w(400); out.on = JSON.parse(localStorage.getItem('turf_v3')).ntf; out.last = window.__ln.sched[window.__ln.sched.length - 1];
      const n = window.__ln.sched.length; document.getElementById('sNtf').click(); await w(400);
      out.off = JSON.parse(localStorage.getItem('turf_v3')).ntf; out.schedAfterOff = window.__ln.sched.length - n; return out; });
    const a = r.last || [], d = a.find((x) => x.id === 101) || {}, m = a.find((x) => x.id === 102) || {};
    const sa = a.find((x) => x.id === 103) || {};
    check('お知らせ: 土曜9時に週末フィーバーを予約', sa.h === 9 && sa.dow === 6 && new Date(sa.at) > new Date(), sa);
    check('お知らせ: ONで夜7時と月曜8時を1通ずつ予約', r.row && r.on === 1 && d.h === 19 && new Date(d.at) > new Date() && m.h === 8 && m.dow === 1, r);
    check('お知らせ: 夜7時は、いつもの場所の近くの宝箱の数を伝える', /近くに宝箱が[0-9]+個/.test(d.body || ''), d.body);
    check('お知らせ: OFFにすると予約しない', r.off === 0 && r.schedAfterOff === 0, r);
    check('お知らせまわりでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4d. 入口の手当て（TikTokのアプリ内ブラウザ → ブラウザへ案内／位置情報オフ → 手順）
  for (const [ua, want] of [['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 musical_ly_35.1.0 BytedanceWebview/d8a21c6', 'x-safari-http'] /* 本番は x-safari-https:// */,
                            ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36 trill_350102 BytedanceWebview/d8a21c6', 'intent://']]) {
    const { p, ctx, errs } = await open('?f=ABCDEF', DONE, new Function(`Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(ua)}});`));
    await p.evaluate(() => sessionStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(700); // 1回目の表示は初期データ投入前の読み込みで消費済み
    const r = await p.evaluate(() => ({ show: document.getElementById('iabModal').classList.contains('show'), href: document.getElementById('iabOpen').getAttribute('href'), src: JSON.parse(localStorage.getItem('turf_v3') || '{}').src }));
    check('TikTok内ブラウザから来た人は src=tiktok を記録し、Safariへ渡す', r.src === 'tiktok' && /src(%3D|=)tiktok/.test(r.href), r);
    check('TikTok内ブラウザ(' + (want === 'intent://' ? 'Android' : 'iPhone') + ')ではブラウザで開く案内が出る', r.show && r.href.startsWith(want) && r.href.includes('f%3DABCDEF') === (want === 'intent://') && r.href.includes('ABCDEF'), r);
    check('案内まわりでエラーなし(' + want + ')', errs.length === 0, errs); await ctx.close(); }
  { const { p, ctx, errs } = await open('', DONE);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      navigator.geolocation.watchPosition = (ok, ng) => { setTimeout(() => ng({ code: 1 }), 50); return 7; }; navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); await w(500);
      return { show: document.getElementById('geoModal').classList.contains('show'), steps: document.querySelectorAll('#geoSteps div').length, iab: document.getElementById('iabModal').classList.contains('show') }; });
    check('位置情報を断られたら手順の画面が出る', r.show && r.steps >= 2 && !r.iab, r);
    check('位置情報オフでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4e. 遊び方デモ（設定から開く → 記録は変わらない → 「自分で遊ぶ」で戻る）
  { const { p, ctx, errs } = await open('', Object.assign({ xp: 4321, c: ['465890,118937'] }, DONE));
    await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); document.getElementById('btnSettings').click(); await w(300); document.getElementById('sDemo').click(); });
    await p.waitForNavigation({ timeout: 10000 }).catch(() => {}); await sleep(4000);
    const d = await p.evaluate(() => ({ url: location.search, bar: !!document.querySelector('.demobar'), xp: JSON.parse(localStorage.getItem('turf_v3')).xp }));
    await p.evaluate(() => document.getElementById('demoEnd').click()); await p.waitForNavigation({ timeout: 10000 }).catch(() => {}); await sleep(800);
    const back = await p.evaluate(() => ({ url: location.search, bar: !!document.querySelector('.demobar'), xp: JSON.parse(localStorage.getItem('turf_v3')).xp }));
    check('遊び方デモを開ける（記録は変わらない）', /demo=2/.test(d.url) && d.bar && d.xp === 4321, d);
    check('デモから「自分で遊ぶ」で元に戻る', back.url === '' && !back.bar && back.xp === 4321, back);
    check('遊び方デモでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4f. GPSが長く途切れて遠くに現れたら、直線でつながない（Web版の画面オフ）＋歩行中は画面を消さない
  { const { p, ctx, errs } = await open('', DONE);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), pts = [], t0 = Date.now();
      window.__wl = 0; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => { window.__wl++; return Promise.resolve({ addEventListener() {}, release() {} }); } } });
      for (let i = 0; i < 20; i++) pts.push([35.685, 139.77 + i * 0.00022, t0 + i * 15000]);
      for (let i = 0; i < 4; i++) pts.push([35.6895, 139.7742 + i * 0.00022, t0 + 19 * 15000 + 300000 + i * 15000]);
      navigator.geolocation.watchPosition = (ok) => { pts.forEach((q) => ok({ coords: { latitude: q[0], longitude: q[1], accuracy: 8 }, timestamp: q[2] })); return 1; };
      navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); await w(400);
      window.dispatchEvent(new Event('pagehide')); const d = JSON.parse(localStorage.getItem('turf_v3')).d; document.getElementById('btnGo').click(); await w(300); return { d, wl: window.__wl }; });
    check('GPSが途切れて500m先に現れても、その間を歩いた扱いにしない', r.d > 300 && r.d < 600, r);
    check('Web版は歩行中に画面を消さないよう要求する', r.wl >= 1, r);
    check('途切れ対策でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4g. ライバル表示（ひとつ上の人まで あと何マス）
  { const { p, ctx, errs } = await open('', Object.assign({ c: ['465890,118937'] }, DONE)); await sleep(3500);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), el = document.getElementById('rival');
      const out = { show: el.classList.contains('show'), text: el.innerText }; el.click(); await w(500);
      out.sheet = document.getElementById('shRank').classList.contains('show'); return out; });
    check('ライバル表示「1位まで あと181マス」が出る', r.show && /1位/.test(r.text) && /181/.test(r.text), r);
    check('ライバル表示からランキングが開く', r.sheet, r);
    check('ライバル表示でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4h. 領地が広がる6秒動画（録画 → 2回目のタップでシェア）
  { const { p, ctx, errs } = await open('', Object.assign({ c: ['465890,118937', '465891,118937', '465891,118938', '465890,118938'] }, DONE));
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('rankCard').click(); await w(400); document.getElementById('pShare').click(); await w(3200);
      const b = document.getElementById('doVideo'), shown = b.style.display !== 'none'; b.click();
      for (let i = 0; i < 30 && !window.__lastVideo; i++) await w(500);
      return { shown, size: window.__lastVideo ? window.__lastVideo.size : 0, type: window.__lastVideo ? window.__lastVideo.type : '', ready: b.classList.contains('ready') }; });
    check('領地が広がる動画を作れる', r.shown && r.size > 20000 && /video/.test(r.type) && r.ready, r);
    check('動画を作ると実績「映える領地」', await p.evaluate(() => JSON.parse(localStorage.getItem('turf_v3')).ach.indexOf('film') >= 0));
    check('動画づくりでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4i. 週末フィーバー（土日は金マスXP2倍の帯が出る）
  { const sat = () => { const RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now()); } getDay() { return 6; } } FD.now = RD.now; FD.parse = RD.parse; FD.UTC = RD.UTC; window.Date = FD; };
    const { p, ctx, errs } = await open('', DONE, sat);
    const r = await p.evaluate(() => ({ on: document.body.classList.contains('evt-on') && document.body.classList.contains('fever'), text: document.getElementById('evt').innerText }));
    check('土日は「週末フィーバー 金マス2倍」の帯が出る', r.on && /週末フィーバー/.test(r.text) && /2倍/.test(r.text), r);
    check('週末フィーバーでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4j. シェア文に遊べるURL（招待コード付き）が入る
  { const { p, ctx, errs } = await open('', Object.assign({ c: ['465890,118937', '465891,118937'] }, DONE));
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); let got = null;
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { got = d; return Promise.resolve(); } });
      document.getElementById('rankCard').click(); await w(400); document.getElementById('pShare').click(); await w(3500);
      document.getElementById('doShare').click(); await w(800); return { text: got && got.text, files: got && got.files && got.files.length }; });
    check('シェア文に招待コード付きのURLが入る', r.text && r.text.includes('/turf?f=ABCD23') && r.files === 1, r);
    check('シェアでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4k. 友だちが増えたら +200XP（1回だけ。開き直しても増えない）
  { const { p, ctx, errs } = await open('', Object.assign({ xp: 1000, fcode: 'ABCD23' }, DONE)); await sleep(4500);
    const a = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('turf_v3')); return { xp: s.xp, frMax: s.frMax }; });
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(5000);
    const b = await p.evaluate(() => JSON.parse(localStorage.getItem('turf_v3')).xp);
    check('友だちが増えると +200XP', a.xp >= 1200 && a.frMax === 1, a);
    check('友だちができると実績「盟友」', await p.evaluate(() => JSON.parse(localStorage.getItem('turf_v3')).ach.indexOf('friend1') >= 0));
    check('同じ友だちで二重にもらえない', b === a.xp, { a: a.xp, b });
    check('友だち報酬でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4l. 本番のエラーを数える（文と行番号・OSだけ送る。同じエラーは1回）
  { const { p, ctx } = await open('', DONE); ERRS.length = 0;
    // ページ自身のスクリプトとして投げる（試験ツールから直接投げると、ブラウザが中身を隠して「Script error.」になるため）
    await p.evaluate(() => { for (let i = 0; i < 3; i++) { const sc = document.createElement('script'); sc.textContent = "setTimeout(function(){ throw new Error('test-boom'); },10)"; document.body.appendChild(sc); } }); await sleep(800);
    const e = ERRS.filter((x) => /test-boom/.test(x.m));
    check('エラーが起きたら文と行番号だけ送る（同じものは1回）', e.length === 1 && typeof e[0].l === 'number' && !('id' in e[0]) && !('lat' in e[0]), ERRS);
    await ctx.close(); }
  // 4m. お守り（1日休んでも連続記録が守られる）
  { const d2 = new Date(); d2.setDate(d2.getDate() - 2); const k2 = d2.getFullYear() + '-' + ('0' + (d2.getMonth() + 1)).slice(-2) + '-' + ('0' + d2.getDate()).slice(-2);
    const { p, ctx, errs } = await open('', Object.assign({ streak: 5, bestStreak: 5, lastDay: k2, omamori: 1 }, DONE));
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), shown = document.getElementById('streakN').textContent, pts = [];
      for (let i = 0; i < 12; i++) pts.push([35.685, 139.77 + i * 0.00022]);
      navigator.geolocation.watchPosition = (ok) => { pts.forEach((q, i) => ok({ coords: { latitude: q[0], longitude: q[1], accuracy: 8 }, timestamp: Date.now() + i * 15000 })); return 1; };
      navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); await w(400); document.getElementById('btnGo').click(); await w(400);
      const s = JSON.parse(localStorage.getItem('turf_v3')); return { shown, streak: s.streak, oma: s.omamori, chip: document.getElementById('omaN').textContent }; });
    check('お守りがあれば、休んだ翌々日も連続記録が表示される', r.shown === '5', r);
    check('歩くとお守りを使って連続記録がつながる（6日・お守り0）', r.streak === 6 && r.oma === 0 && r.chip === '', r);
    check('お守りが守ると実績「お守り様」', await p.evaluate(() => JSON.parse(localStorage.getItem('turf_v3')).ach.indexOf('oma') >= 0));
    check('お守りでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4n. 先週のふりかえり（週が変わって最初の起動で1回）
  { const K = (d) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    const days = {}; for (const [back, cells] of [[7, 120], [5, 180], [3, 0], [14, 100], [12, 100]]) { const d = new Date(mon); d.setDate(d.getDate() - back); days[K(d)] = { d: 800, cells, loops: cells ? 2 : 0, best: 50, chests: 1, gold: 1 }; }
    const { p, ctx, errs } = await open('', Object.assign({ days, xp: 2000 }, DONE)); await sleep(3500);
    const r = await p.evaluate(() => ({ show: document.getElementById('recapModal').classList.contains('show'), grid: document.getElementById('rcGrid').innerText.replace(/\s+/g, ' '), cmp: document.getElementById('rcCmp').innerText, next: document.getElementById('rcNext').innerText }));
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(4500);
    const again = await p.evaluate(() => document.getElementById('recapModal').classList.contains('show'));
    check('週が変わったら先週のふりかえりが出る（300マス・3日・前週比+50%）', r.show && /300/.test(r.grid) && /3\/7日/.test(r.grid) && /\+50%/.test(r.cmp) && /今週の目標/.test(r.next), r);
    check('ふりかえりは週に1回だけ', !again);
    check('ふりかえりでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4o. 初回は開いた瞬間に位置情報の許可を求めない（説明→「出陣」で初めて）。許可済みの人だけ黙って現在地へ
  { const spy = (granted) => new Function(`window.__gcp=0; const G=Geolocation.prototype; G.getCurrentPosition=function(){ window.__gcp++; }; G.watchPosition=function(){ window.__wp=(window.__wp||0)+1; return 1; };
      if (navigator.permissions) { const q=navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query=(d)=>d&&d.name==='geolocation'?Promise.resolve({state:'${granted}'}):q(d); }`);
    const A = await open('', null, spy('prompt')); await sleep(1500);
    const a = await A.p.evaluate(() => ({ gcp: window.__gcp, wp: window.__wp || 0, onb: !document.getElementById('onb').classList.contains('hide') }));
    await A.p.evaluate(() => { const s = document.getElementById('slides'); s.scrollLeft = s.clientWidth * 2; }); await sleep(600);
    await A.p.evaluate(() => document.getElementById('onbNext').click()); await sleep(500);
    const an = await A.p.evaluate(() => ({ name: document.getElementById('nameModal').classList.contains('show'), wp: window.__wp || 0 }));
    await A.p.evaluate(() => document.getElementById('nmSkip').click()); await sleep(800);
    const a2 = await A.p.evaluate(() => ({ wp: window.__wp || 0 }));
    check('はじめに名前を決める画面が出る（位置情報はまだ）', an.name && an.wp === 0, an);
    check('初回は開いただけでは位置情報を求めない', a.onb && a.gcp === 0 && a.wp === 0, a);
    check('「位置情報をONにして出陣」で初めて位置情報を使う', a2.wp >= 1, a2);
    const B = await open('', DONE, spy('granted')); await sleep(1500);
    const b = await B.p.evaluate(() => window.__gcp);
    check('許可済みの人は起動時に黙って現在地へ', b === 1, b);
    check('起動時の位置情報まわりでエラーなし', A.errs.length + B.errs.length === 0, A.errs.concat(B.errs)); await A.ctx.close(); await B.ctx.close(); }
  // 4p. 歩いている間はレベルアップの全画面を出さず、一時停止のリザルトの後に見せる
  { const { p, ctx, errs } = await open('', Object.assign({ xp: 70 }, DONE));
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), pts = [];
      for (let i = 0; i < 16; i++) pts.push([35.685, 139.77 + i * 0.00025]);
      navigator.geolocation.watchPosition = (ok) => { pts.forEach((q, i) => ok({ coords: { latitude: q[0], longitude: q[1], accuracy: 8 }, timestamp: Date.now() + i * 15000 })); return 1; };
      navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); await w(1500);
      const during = document.getElementById('lvModal').classList.contains('show');
      document.getElementById('btnGo').click(); await w(600);
      const res = document.getElementById('resModal').classList.contains('show'), tmr = document.getElementById('rTmr').hidden ? '' : document.getElementById('rTmr').textContent; document.getElementById('rClose').click(); await w(900);
      return { tmr, during, res, after: document.getElementById('lvModal').classList.contains('show'), xp: JSON.parse(localStorage.getItem('turf_v3')).xp, open: [...document.querySelectorAll('.modal.show,.sheet.show')].map((m) => m.id) }; });
    check('歩行中はレベルアップの全画面を出さない', r.xp >= 80 && !r.during, r);
    check('一時停止のリザルトを閉じるとレベルアップを見せる', r.res && r.after, r);
    check('リザルトに明日の宝箱の予告が出る', /明日、この近くに宝箱が\d+個/.test(r.tmr), r.tmr);
    check('歩行中の割り込み対策でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4q. 位置がわからないうちは日本全体＋案内（東京駅を現在地のように見せない）
  { const { p, ctx, errs } = await open('', DONE, () => { const G = Geolocation.prototype; G.getCurrentPosition = function () {}; if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: 'prompt' }); });
    const r = await p.evaluate(() => ({ hint: !document.getElementById('hereHint').hidden, op: getComputedStyle(document.querySelector('.me').closest('.leaflet-marker-icon')).opacity }));
    const pts = []; for (let i = 0; i < 6; i++) pts.push([34.70, 135.50 + i * 0.0003]);
    const r2 = await p.evaluate(async (pts) => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      navigator.geolocation.watchPosition = (ok) => { pts.forEach((q, i) => ok({ coords: { latitude: q[0], longitude: q[1], accuracy: 8 }, timestamp: Date.now() + i * 15000 })); return 1; }; navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); await w(800);
      return { hint: !document.getElementById('hereHint').hidden, op: getComputedStyle(document.querySelector('.me').closest('.leaflet-marker-icon')).opacity }; }, pts);
    check('位置がわからない時は案内を出し、現在地ピンを隠す', r.hint && r.op === '0', r);
    check('出陣して位置がわかると案内が消えピンが出る', !r2.hint && r2.op === '1', r2);
    check('位置不明の表示でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4r. 家の中（GPSの精度が低い）でも、地図はおおよその現在地へ動き、理由を伝える。道には使わない
  { const { p, ctx, errs } = await open('', DONE, () => { const G = Geolocation.prototype; G.getCurrentPosition = function () {}; if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: 'prompt' }); });
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); let toast = '';
      navigator.geolocation.watchPosition = (ok) => { for (let i = 0; i < 5; i++) ok({ coords: { latitude: 34.70 + i * 0.0004, longitude: 135.50, accuracy: 80 }, timestamp: Date.now() + i * 15000 }); return 1; }; navigator.geolocation.clearWatch = () => {};
      document.getElementById('btnGo').click(); for (let i = 0; i < 20; i++) { await w(250); const t = document.getElementById('toast').textContent; if (/精度/.test(t)) toast = t; }
      document.getElementById('btnGo').click(); await w(400);
      return { toast, d: JSON.parse(localStorage.getItem('turf_v3')).d || 0, hint: !document.getElementById('hereHint').hidden }; });
    check('精度が低い時は「GPSの精度が低め」と伝え、道には使わない', /精度が低め/.test(r.toast) && r.d === 0 && !r.hint, r);
    check('精度が低い時の表示でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4s. アプリ版で App Store に Pro の商品がまだ無い時（最初の審査）は、Pro 関連を一切見せない
  { const { p, ctx, errs } = await open('', DONE, () => { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; });
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      document.getElementById('btnSettings').click(); await w(400); out.row = !!document.getElementById('sPro'); document.getElementById('backdrop').click(); await w(300);
      document.getElementById('rankCard').click(); await w(400); out.proSkin = !!document.querySelector('[data-skin=rainbow]'); document.getElementById('backdrop').click(); await w(300);
      document.getElementById('btnMissions').click(); await w(400); out.up = !!document.getElementById('misPro'); return out; });
    check('商品が無いアプリ版では Pro の行・スキン・案内を出さない', !r.row && !r.proSkin && !r.up, r);
    check('Pro非表示でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4t. App Store で公開後: iPhone の Web版はアプリ版へ案内（番号が入るまでは何も出ない）
  { const pre = () => { window.__APPSTORE_ID = '1234567890'; Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }); };
    const { p, ctx, errs } = await open('', DONE, pre);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('btnSettings').click(); await w(400);
      const link = [...document.querySelectorAll('#setBody a')].find((a) => /apps\.apple\.com/.test(a.href));
      document.getElementById('backdrop').click(); await w(300);
      return { link: link && link.href }; });
    const plain = await open('', DONE); const none = await plain.p.evaluate(async () => { document.getElementById('btnSettings').click(); await new Promise((r) => setTimeout(r, 400)); return [...document.querySelectorAll('#setBody a')].some((a) => /apps\.apple\.com/.test(a.href)); });
    check('公開後は iPhone の Web版の設定に App Store へのリンク', r.link === 'https://apps.apple.com/jp/app/id1234567890', r);
    check('iPhone以外にはアプリ版（App Store）の案内を出さない', none === false);
    check('アプリ版の案内でエラーなし', errs.length + plain.errs.length === 0, errs.concat(plain.errs)); await ctx.close(); await plain.ctx.close(); }
  // 4u. アップデートのお知らせ（前から遊んでいる人に1回だけ。はじめての人には出さない）
  { const { p, ctx, errs } = await open('', Object.assign({ loops: 5, xp: 900 }, DONE)); await sleep(5600);
    const a = await p.evaluate(() => ({ show: document.getElementById('newsModal').classList.contains('show'), n: document.querySelectorAll('#newsList > div').length }));
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
    const again = await p.evaluate(() => document.getElementById('newsModal').classList.contains('show'));
    const B = await open('', DONE); await sleep(6000); const fresh = await B.p.evaluate(() => document.getElementById('newsModal').classList.contains('show'));
    check('前から遊んでいる人にアップデートのお知らせ（1回だけ）', a.show && a.n >= 5 && !again, { a, again });
    check('はじめての人にはアップデートのお知らせを出さない', !fresh);
    check('お知らせでエラーなし', errs.length + B.errs.length === 0, errs.concat(B.errs)); await ctx.close(); await B.ctx.close(); }
  // 4v. アプリ版のバックグラウンドGPS: 本物のアプリでは addWatcher が Promise ではなく ID をそのまま返す（2026-10-03 本番で TypeError）
  { const { p, ctx, errs } = await open('', DONE, () => { window.__bg = { add: 0, removed: [] }; const stub = new Proxy({}, { get: () => () => Promise.resolve({}) });
      const BG = { addWatcher(o, cb) { window.__bg.add++; window.__bg.cb = cb; return 'cb-' + window.__bg.add; }, removeWatcher(o) { window.__bg.removed.push(o.id); return Promise.resolve(); }, openSettings() { return Promise.resolve(); } };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({ BackgroundGeolocation: BG }, { get: (t, k) => (k in t ? t[k] : stub) }) }; });
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('btnGo').click(); await w(600);
      for (let i = 0; i < 6; i++) window.__bg.cb({ latitude: 35.685, longitude: 139.77 + i * 0.0003, accuracy: 8, time: Date.now() + i * 15000 }, null);
      await w(300); document.getElementById('btnGo').click(); await w(600);
      return { add: window.__bg.add, removed: window.__bg.removed.slice(), d: JSON.parse(localStorage.getItem('turf_v3')).d || 0 }; });
    check('アプリ版: 位置の記録を止めると、バックグラウンドGPSもきちんと止まる', r.add === 1 && r.removed.length === 1 && r.removed[0] === 'cb-1' && r.d > 0, r);
    check('アプリ版のバックグラウンドGPSでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4w. アプリ版の通し: 一周して囲む→リザルト→カードをシェア（Filesystem→Share）→設定。ネイティブの呼び出しでエラーが出ない
  { const { p, ctx, errs } = await open('', DONE, () => { window.__nat = []; const mk = (name) => new Proxy({}, { get: (t, m) => (...a) => { window.__nat.push(name + '.' + String(m)); return Promise.resolve(m === 'writeFile' ? { uri: 'file:///tmp/c.png' } : m === 'checkPermissions' || m === 'requestPermissions' ? { display: 'granted' } : {}); } });
      const BG = { addWatcher(o, cb) { window.__cb = cb; return 'cb-1'; }, removeWatcher() { return Promise.resolve(); }, openSettings() { return Promise.resolve(); } };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({ BackgroundGeolocation: BG }, { get: (t, k) => (k in t ? t[k] : mk(String(k))) }) }; });
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const c = [35.685, 139.77], R = 0.0012;
      document.getElementById('btnGo').click(); await w(500);
      for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; window.__cb({ latitude: c[0] + R * Math.sin(a) + (i % 3) * 0.00002, longitude: c[1] + R * 1.23 * Math.cos(a), accuracy: 8, time: Date.now() + i * 12000 }, null); }
      await w(800); document.getElementById('btnGo').click(); await w(900);
      const res = document.getElementById('resModal').classList.contains('show');
      if (res) { document.getElementById('rShare').click(); await w(2500); document.getElementById('doShare').click(); await w(800); }
      document.querySelectorAll('.modal.show .x, .modal.show [aria-label="閉じる"]').forEach((b) => b.click()); await w(400);
      document.getElementById('btnSettings').click(); await w(600);
      return { res, cells: JSON.parse(localStorage.getItem('turf_v3')).loops || 0, nat: window.__nat.filter((x, i, a) => a.indexOf(x) === i), set: document.getElementById('setBody').textContent.length }; });
    check('アプリ版: 一周して囲める→リザルト→シェアでネイティブのシェアを呼ぶ', r.res && r.cells >= 1 && r.nat.includes('Share.share'), r);
    check('アプリ版の通しでエラーなし', errs.length === 0 && r.set > 50, errs); await ctx.close(); }
  // 4x. 名前を自分で書く（NGはサーバーが弾く）・相手の通報とブロック
  { const { p, ctx, errs } = await open('', DONE);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      document.getElementById('btnRank').click(); await w(900);
      document.getElementById('reroll').click(); await w(300);
      const inp = document.getElementById('npTxt'); inp.value = 'しね太'; inp.dispatchEvent(new Event('input'));
      document.getElementById('npSet').click(); await w(600);
      out.ng = document.getElementById('npMsg').textContent;
      document.getElementById('npTxt').value = '江戸川の虎'; document.getElementById('npSet').click(); await w(1500);
      out.closed = document.getElementById('namePick').hidden; out.saved = JSON.parse(localStorage.getItem('turf_v3')).cn;
      const st = JSON.parse(localStorage.getItem('turf_v3')); out.av = st.av; const mi = document.querySelector('#meBar .mav img'); out.barAv = mi ? mi.getAttribute('src').slice(0, 26) : '';
      out.bar = document.getElementById('meBar').textContent;
      const row = document.querySelector('#rkList [data-h]'); row.click(); await w(300);
      out.act = !document.getElementById('rkAct').hidden;
      document.getElementById('raRp').click(); await w(1200);
      out.blk = JSON.parse(localStorage.getItem('turf_v3')).blk;
      out.shown = document.querySelector('#rkList [data-h]').textContent;
      return out; });
    check('名前を自分で書ける（保存・表示）', r.closed && r.saved === '江戸川の虎' && /江戸川の虎/.test(r.bar), r);
    check('使えない名前はエラーを出して保存しない', /使えない/.test(r.ng), r.ng);
    check('はじめのアイコン（5種からランダム）が割り当てられ自分の欄に出る', r.av >= 0 && r.av < 5 && r.barAv === 'data:image/svg+xml;utf8,%3', { av: r.av, bar: r.barAv });
    // 画像アップロード（ファイル選択→160pxのJPEGに縮めて送る→自分の欄が画像になる）
    await p.evaluate(() => { document.getElementById('reroll').click(); });
    await sleep(300);
    const [fc] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), p.evaluate(() => document.getElementById('npPic').click())]);
    await fc.accept([path.join(SITE, 'turf-og.jpg')]); await sleep(1500);
    const pr = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('turf_v3')); const im = document.querySelector('#meBar .mav img');
      return { pv: st.pv, picHead: (st.pic || '').slice(0, 23), img: !!im, w: im ? im.naturalWidth : 0 }; });
    check('アイコン画像をアップロードでき、160pxのJPEGで送って自分の欄に出る', pr.pv === 123 && pr.picHead === 'data:image/jpeg;base64,' && pr.img && pr.w === 160 && PICS.length === 1 && PICS[0] < 60000, { pr, PICS });
    check('相手をタップで通報でき、通報した相手は表示しない', r.act && REPORTS.includes('a1b2c3d4e5f6') && (r.blk || []).includes('a1b2c3d4e5f6') && /ブロック中/.test(r.shown), r);
    check('名前・通報まわりでエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4y. 設定の版表示を7回タップで運営者の端末に（集計から外す）
  { const { p, ctx, errs } = await open('', DONE);
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('btnSettings').click(); await w(500);
      for (let i = 0; i < 7; i++) { document.getElementById('setFoot').click(); await w(80); } await w(1200);
      return { st: JSON.parse(localStorage.getItem('turf_v3')).staff, foot: document.getElementById('setFoot').textContent }; });
    check('版表示を7回タップで運営者の端末になる', r.st === true && /運営者の端末/.test(r.foot), r);
    check('運営者の印でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 4z. 征服した場所（領地を場所ごとにまとめて見返す・タップで地図へ）と「今日」バー
  { const CELL = 0.0003, cells = []; const blob = (la, lo, r) => { const cy = Math.floor(la / CELL), cx = Math.floor(lo / CELL); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) cells.push((cx + x) + ',' + (cy + y)); };
    blob(35.685, 139.77, 4); blob(35.01, 135.768, 3);
    const { p, ctx, errs } = await open('', Object.assign({ c: cells, cq: [{ t: Date.now() - 864e5, la: 35.685, lo: 139.77, n: 81 }], ll: [35.685, 139.77], loops: 2 }, DONE));
    const r = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      out.today = !document.getElementById('today').hidden && /宝箱/.test(document.getElementById('tdChest').textContent) && /ミッション 0\/3/.test(document.getElementById('tdMis').textContent);
      document.getElementById('tdMis').click(); await w(500); out.misOpen = document.getElementById('shMissions').classList.contains('show'); document.querySelector('#shMissions [data-close]').click(); await w(500);
      document.getElementById('rankCard').click(); await w(800);
      out.rows = document.querySelectorAll('.place').length; out.all = !!document.getElementById('jpOpen');
      out.dates = [...document.querySelectorAll('.place .pv small')].map((e) => e.textContent);
      document.querySelector('.place').click(); await w(800); out.closed = !document.getElementById('shProfile').classList.contains('show');
      return out; });
    check('「今日」バーに近くの宝箱とミッションが出て、タップでお題が開く', r.today && r.misOpen, r);
    check('征服した場所: 離れた2か所を別々に並べ、取った日も出す・タップで地図へ', r.rows === 2 && r.all && r.dates.some((d) => /\d{4}\/\d+\/\d+/.test(d)) && r.closed, r);
    check('征服した場所でエラーなし', errs.length === 0, errs); await ctx.close(); }
  // 5. デモ・撮影モード
  for (const q of ['?demo=1', '?demo=2', '?shot=walk', '?shot=claim', '?shot=chest', '?shot=rank', '?shot=missions', '?shot=card']) {
    const { p, ctx, errs } = await open(q); await sleep(3200);
    check('モード ' + q + ' がエラーなしで動く', errs.length === 0 && await p.evaluate(() => getComputedStyle(document.body).display !== 'none'), errs); await ctx.close(); }

  await br.close(); srv.close();
  let ng = 0; for (const r of results) { if (!r.ok) ng++; console.log((r.ok ? 'OK  ' : 'NG  ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.info))); }
  console.log(`\n${results.length - ng}/${results.length} 合格`); process.exitCode = ng ? 1 : 0;
})();
