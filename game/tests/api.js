// じんとり散歩のサーバー（worker/index.js）を本物のまま手元で動かして、APIの約束ごとを確かめる。
// wrangler dev を空の保存先で起動 → 登録・ランキング・友だち・引き継ぎ・削除・回数制限・不正な値を検査
// → 時計を翌月に進めて再起動し、月替わり（シーズン確定・今月ランキング）も検査する。
// 使い方: cd game && node tests/api.js   （wrangler が無ければ npx が取ってくる）
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), PORT = 8700 + Math.floor(Math.random() * 200), BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'turf-api-'));
const results = []; const check = (name, ok, info) => results.push({ name, ok: !!ok, info });
const hex = (n) => crypto.randomBytes(n / 2).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ipN = 0; const freshIp = () => `10.0.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;

function start(vars) {
  const args = ['--yes', 'wrangler', 'dev', '--config', 'wrangler.test.jsonc', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', STATE, '--var', 'TRUST_XFF:1', '--var', 'TEST_AI:1', '--log-level', 'error'];
  for (const v of vars || []) args.push('--var', v);
  const ch = spawn('npx', args, { cwd: ROOT, shell: process.platform === 'win32', // Windows の npx は .cmd なので shell 経由
    stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' }) });
  let log = ''; ch.stdout.on('data', (d) => { log += d; }); ch.stderr.on('data', (d) => { log += d; }); ch.log = () => log;
  return ch;
}
async function ready() { for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE + '/api/names'); if (r.ok) return true; } catch (e) {} await sleep(500); } return false; }
function stop(ch) { return new Promise((res) => {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(ch.pid), '/T', '/F'], { stdio: 'ignore' }).on('exit', () => res());
  else { try { process.kill(-ch.pid); } catch (e) { ch.kill('SIGTERM'); } setTimeout(res, 1500); } }); }

async function api(p, body, ip, method) {
  const r = await fetch(BASE + p, { method: method || (body ? 'POST' : 'GET'), headers: Object.assign({ 'Content-Type': 'application/json' }, ip ? { 'X-Forwarded-For': ip } : {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { st: r.status, j: j || {} };
}
const player = (m) => ({ id: hex(32), tok: hex(32), n: [3, 5], m: m || null });
const score = (P, cells, ip, extra) => api('/api/score', Object.assign({ id: P.id, tok: P.tok, n: P.n, cells, area: cells * 900, lv: 3, m: P.m }, extra || {}), ip);

(async () => {
  let ch = start();
  if (!(await ready())) { console.log(ch.log()); throw new Error('wrangler dev が起動しない'); }
  try {
    const A = player('13123'), B = player('13123'), C = player(null), ipA = freshIp(), ipB = freshIp();
    // --- 登録とランキング ---
    check('新規登録できる', (await score(A, 50, ipA, { src: 'tiktok' })).j.ok);
    check('別の人も登録できる', (await score(B, 20, ipB, { src: 'evil<script>' })).j.ok);
    const all = (await api('/api/rank?kind=all&id=' + A.id)).j;
    check('総合ランキングに並び、自分の順位が返る', all.top && all.top[0].v >= all.top[1].v && all.me && all.me.rank === 1, all);
    check('ランキングにIDやトークンが含まれない', !JSON.stringify(all).includes(A.id) && !JSON.stringify(all).includes(A.tok));
    const wk = (await api('/api/rank?kind=week&m=13123&id=' + B.id)).j;
    check('地元の今週ランキング（増えたマス数）', wk.total === 2 && wk.me.rank === 2 && wk.me.v === 20 && wk.top[0].v === 50, wk);
    // --- 不正な値・なりすまし ---
    check('IDの形が変なら400', (await api('/api/score', { id: 'x', tok: A.tok, n: [0, 0], cells: 1, area: 1, lv: 1 }, freshIp())).st === 400);
    check('面積がマス数に見合わないなら400', (await score(C, 10, freshIp(), { area: 10 * 5000 })).st === 400);
    check('名前の番号が範囲外なら400', (await score(C, 10, freshIp(), { n: [999, 0] })).st === 400);
    check('新規でいきなり巨大なスコアは拒否', (await score(player(), 30000, freshIp())).j.error === 'too fast');
    check('トークン違い（なりすまし）は403', (await score({ id: A.id, tok: hex(32), n: A.n }, 60, ipA)).st === 403);
    check('5秒以内の連続送信は間引く', (await score(A, 55, ipA)).j.throttled === true);
    await sleep(5300);
    check('経過時間に見合わない急増は拒否', (await score(A, 50 + 2000, ipA)).j.error === 'too fast');
    await sleep(5300);
    check('普通の増え方なら受け付ける', (await score(A, 120, ipA)).j.ok);
    // --- 友だち ---
    const codeA = (await api('/api/friend/code', { id: A.id, tok: A.tok }, ipA)).j.code;
    check('招待コードは6文字・毎回同じ', /^[A-HJ-NP-Z2-9]{6}$/.test(codeA) && (await api('/api/friend/code', { id: A.id, tok: A.tok }, ipA)).j.code === codeA, codeA);
    check('自分のコードは追加できない', (await api('/api/friend/add', { id: A.id, tok: A.tok, code: codeA }, ipA)).j.error === 'self');
    const add = (await api('/api/friend/add', { id: B.id, tok: B.tok, code: codeA }, ipB)).j;
    check('コードで友だちになれる（名前が返る）', add.ok && typeof add.name === 'string' && add.name.length > 0, add);
    const fA = (await api('/api/friends', { id: A.id, tok: A.tok }, ipA)).j;
    check('相互に友だちになり、相手のIDは返らない', fA.count === 1 && fA.list.length === 2 && !JSON.stringify(fA).includes(B.id), fA);
    check('友だちの解除', (await api('/api/friend/remove', { id: B.id, tok: B.tok, fi: 0 }, ipB)).j.ok && (await api('/api/friends', { id: A.id, tok: A.tok }, ipA)).j.count === 0);
    check('存在しないコードは見つからない', (await api('/api/friend/add', { id: B.id, tok: B.tok, code: 'ZZZZZZ' }, ipB)).j.error === 'notfound');
    // --- 自分で書く名前・通報 ---
    const nm = (P, name, ip) => api('/api/name', { id: P.id, tok: P.tok, name }, ip);
    const okN = (await nm(A, 'ネオン忍者A', ipA)).j;
    check('自分で書いた名前にできる', okN.ok && okN.name === 'ネオン忍者A', okN);
    const rA = (await api('/api/rank?kind=all&id=' + B.id)).j, rowA = rA.top.find((r) => r.name === 'ネオン忍者A');
    check('ランキングに書いた名前と相手の番号が出る（IDは出ない）', rowA && /^[0-9a-f]{12}$/.test(rowA.h) && !JSON.stringify(rA).includes(A.id), rA.top);
    const bads = [['しね太郎', 'ng'], ['シネ', 'ng'], ['ＳＥＸ王', 'ng'], ['f.u.c.k', 'ng'], ['運営です', 'ng'], ['0901234567', 'contact'], ['LINEはabc', 'contact'], ['あ'.repeat(11), 'len'], ['   ', 'len'], ['<b>x</b>', 'chars'], ['😀', 'chars']];
    const gotErr = [];
    for (const [w, e] of bads) { await sleep(200); const r = (await nm(B, w, freshIp())).j; if (r.error !== e) gotErr.push([w, r]); }
    check('NGワード・連絡先・長すぎ・使えない文字は弾く', gotErr.length === 0, gotErr);
    check('続けて変えるのは30秒あける', (await nm(A, 'ネオン忍者B', ipA)).j.error === 'wait');
    check('他人のトークンでは名前を変えられない', (await nm({ id: A.id, tok: B.tok }, 'てすと', ipA)).st === 403);
    const D = player('13123'), E = player('13123'), ipD = freshIp(), ipE2 = freshIp();
    await score(D, 5, ipD); await score(E, 5, ipE2);
    const rp = (P, h, ip) => api('/api/report', { id: P.id, tok: P.tok, h }, ip);
    check('通報できる（1人目ではまだ消えない）', (await rp(D, rowA.h, ipD)).j.hidden === false);
    check('同じ人が何回通報しても1人分', (await rp(D, rowA.h, ipD)).j.hidden === false);
    check('2人目の通報で書いた名前が消える', (await rp(E, rowA.h, ipE2)).j.hidden === true);
    const rA2 = (await api('/api/rank?kind=all&id=' + A.id)).j;
    check('消えた後は組み合わせの名前に戻り、本人には書けない期限が返る', !JSON.stringify(rA2).includes('ネオン忍者A') && rA2.me.cnban > Date.now(), rA2.me);
    await sleep(31000);
    check('通報で止められている間は書けない', (await nm(A, 'べつの名前', ipA)).j.error === 'banned');
    const stN = (await api('/api/stats')).j;
    const before = (await api('/api/stats')).j.players;
    check('運営者の印をつけられる', (await api('/api/staff', { id: E.id, tok: E.tok, on: true }, ipE2)).j.staff === true);
    await sleep(100); const afterSt = (await api('/api/stats')).j;
    check('運営者の端末は運営ページの人数に数えない', afterSt.players === before - 1 && afterSt.staff === 1, { before, after: afterSt.players, staff: afterSt.staff });
    check('他人のトークンでは運営者の印をつけられない', (await api('/api/staff', { id: E.id, tok: D.tok, on: true }, ipE2)).st === 403);
    check('運営ページに始めた人の流れが出る', stN.funnel && stN.funnel.n >= 4 && stN.funnel.claimed >= 2, stN.funnel);
    check('運営ページに通報された名前が出る', (stN.reported || []).some((r) => r.nm === 'ネオン忍者A' && r.n === 2), stN.reported);
    // --- アイコン（用意した絵の番号と色だけ） ---
    await sleep(5300); await score(D, 6, ipD, { av: 7, ac: 3 });
    const rAv = (await api('/api/rank?kind=all&id=' + D.id)).j, mineAv = rAv.top.find((r) => r.me);
    check('アイコンの番号と色を保存してランキングに出す', mineAv && mineAv.av === 7 && mineAv.ac === 3, mineAv);
    await score(D, 6, ipD, { av: 999, ac: -1 });
    const rAv2 = (await api('/api/rank?kind=all&id=' + D.id)).j.top.find((r) => r.me);
    check('範囲外のアイコン番号は保存しない（すぐ後の送信でも反映）', rAv2 && rAv2.av === null && rAv2.ac === null, rAv2);
    // --- アイコン画像（AIの確認は試験用の判定に置き換え） ---
    const jpg = (mark) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from(mark), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]).toString('base64');
    const pic = (P, img, ip) => api('/api/pic', { id: P.id, tok: P.tok, img }, ip);
    const ipP = freshIp(), up = (await pic(D, jpg('cat'), ipP)).j;
    check('アイコン画像をアップロードできる', up.ok && up.pv > 0, up);
    const rP = (await api('/api/rank?kind=all&id=' + E.id)).j, rowD = rP.top.find((r) => r.pv);
    const got = rowD ? await fetch(BASE + '/api/pic/' + rowD.h) : null;
    check('ランキングに画像の印が出て、画像を取り出せる（JPEG）', rowD && got && got.status === 200 && got.headers.get('content-type') === 'image/jpeg', rowD);
    check('AIが不適切と判断した画像は保存しない', (await pic(D, jpg('UNSAFE'), ipP)).j.error === 'ng');
    check('JPEGでないものは受け付けない', (await pic(D, Buffer.alloc(300, 1).toString('base64'), ipP)).st === 400);
    check('大きすぎる画像は受け付けない', (await pic(D, 'A'.repeat(70000), ipP)).st === 400);
    check('他人のトークンではアップロードできない', (await pic({ id: D.id, tok: E.tok }, jpg('x'), ipP)).st === 403);
    const F2 = player('13123'), ipF2 = freshIp(); await score(F2, 5, ipF2);
    await rp(E, rowD.h, ipE2); await rp(F2, rowD.h, ipF2);
    const gone = await fetch(BASE + '/api/pic/' + rowD.h);
    check('2人に通報された画像は消える', gone.status === 404);
    // --- 機種変更の引き継ぎ ---
    const k = hex(64), blob = Buffer.from('encrypted-blob-' + hex(16)).toString('base64');
    check('引き継ぎデータを預けられる', (await api('/api/xfer/put', { id: A.id, tok: A.tok, k, blob }, ipA)).j.ok);
    check('他人のトークンでは預けられない', (await api('/api/xfer/put', { id: A.id, tok: B.tok, k: hex(64), blob }, ipA)).st === 403);
    const g1 = (await api('/api/xfer/get', { k }, freshIp())).j, g2 = (await api('/api/xfer/get', { k }, freshIp())).j;
    check('引き継ぎデータは1回だけ受け取れる', g1.blob === blob && g2.error === 'notfound', { g1, g2 });
    const ntok = hex(32);
    check('トークンの差し替え', (await api('/api/rekey', { id: A.id, tok: A.tok, ntok }, ipA)).j.ok);
    check('差し替え後、古いトークンでは送れない', (await score(A, 121, ipA)).st === 403);
    A.tok = ntok;
    // --- 削除 ---
    check('データ削除', (await api('/api/delete', { id: B.id, tok: B.tok }, ipB)).j.ok);
    const afterDel = (await api('/api/rank?kind=all')).j;
    check('削除した人はランキングから消える', afterDel.total === 4, afterDel);
    // --- 回数制限 ---
    const ipR = freshIp(), R = player(); let got429 = false;
    for (let i = 0; i < 32 && !got429; i++) got429 = (await score(R, 1, ipR)).st === 429;
    check('同じ接続元からの連打は429（1分30回まで）', got429);
    const ipN2 = freshIp(); let newOk = 0, new429 = false;
    for (let i = 0; i < 22; i++) { const s = (await score(player(), 1, ipN2)); if (s.j.ok) newOk++; if (s.st === 429) new429 = true; }
    check('同じ接続元からの新規登録は1日20人まで', newOk === 20 && new429, { newOk });
    // --- 端末のエラーの件数 ---
    const ipE = freshIp();
    for (let i = 0; i < 3; i++) await api('/api/err', { m: 'TypeError: x is undefined', l: 1234, os: 'ios', app: 0 }, ipE);
    await api('/api/err', { m: 'a'.repeat(500), l: 'zzz', os: 'evil<script>' }, ipE);
    let e429 = false; for (let i = 0; i < 10 && !e429; i++) e429 = (await api('/api/err', { m: 'spam', l: 1 }, ipE)).st === 429;
    check('同じ接続元からのエラー報告は1分10件まで', e429);
    // --- 集計・招待リンクのプレビュー ---
    const st = (await api('/api/stats')).j;
    const er = (st.errors || []).find((r) => r.msg === 'TypeError: x is undefined');
    check('エラーは文・行・OSごとに件数でまとまる', er && er.n === 3 && er.line === 1234 && er.os === 'ios/web', st.errors);
    check('エラー文は200文字まで・OSは決まった値だけ', (st.errors || []).every((r) => r.msg.length <= 200 && /^(ios|android|other)\/(web|app)$/.test(r.os)), st.errors);
    const srcs = Object.fromEntries((st.sources || []).map((r) => [r.src, r.n]));
    check('どこから来たかを決まった種類だけで数える', srcs.tiktok === 1 && !Object.keys(srcs).some((k) => /script/.test(k)), st.sources);
    check('運営の集計が合計だけ返す', st.players >= 20 && Array.isArray(st.daily) && st.daily.length === 14 && !JSON.stringify(st).includes(A.id), { players: st.players });
    const og = await (await fetch(BASE + '/turf?f=ABCDEF')).text();
    check('招待リンクは招待用のプレビュー画像に差し替わる', og.includes('turf-og-invite'));
    const plain = await (await fetch(BASE + '/turf')).text();
    check('普通のリンクは通常のプレビュー画像', plain.includes('turf-og.jpg') && !plain.includes('turf-og-invite'));
  } finally { await stop(ch); }

  // --- 月替わり（翌月1日 JST 01:00 まで時計を進めて再起動） ---
  const now = Date.now(), j = new Date(now + 9 * 3600e3), nextMo = Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + 1, 1, 1) - 9 * 3600e3;
  const moNow = j.toISOString().slice(0, 7);
  ch = start(['TIME_SHIFT_MS:' + (nextMo - now)]);
  if (!(await ready())) { console.log(ch.log()); throw new Error('wrangler dev（月替わり）が起動しない'); }
  try {
    const P = player('13123'), ip = freshIp();
    // 新しい月の人は、まだ前月の記録を持たない
    check('新しい月でも登録できる', (await score(P, 5, ip)).j.ok);
    const mo = (await api('/api/rank?kind=month')).j;
    check('今月ランキングは新しい月の分だけ', mo.total >= 1 && mo.top.every((r) => r.v <= 5), mo);
    const se = (await api('/api/season?mo=' + moNow)).j;
    check('前月のシーズン結果（前月に増やした人が並ぶ）', se.mo === moNow && se.total >= 1 && se.top[0].v >= 100, se);
  } finally { await stop(ch); }

  await sleep(800); try { fs.rmSync(STATE, { recursive: true, force: true }); } catch (e) {} // Windows では少し遅れて消える
  let ng = 0; for (const r of results) { if (!r.ok) ng++; console.log((r.ok ? 'OK  ' : 'NG  ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.info))); }
  console.log(`\n${results.length - ng}/${results.length} 合格`); process.exit(ng ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
