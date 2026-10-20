// 領地の大きさ(2千/2万/6万マス)ごとに、GPSが1回届いたときの処理時間をCPU 1/4の遅さで測る（手動で使う）
// 使い方: cd game && node tools/perf-fix.js
const puppeteer=require(process.cwd()+'/node_modules/puppeteer-core'),http=require('http'),fs=require('fs'),path=require('path');
const SITE=path.join(process.cwd(),'..','site');
const srv=http.createServer((q,w)=>{let f=decodeURIComponent(q.url.split('?')[0]);const fp=path.join(SITE,f);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){w.writeHead(404);return w.end();}
 w.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});fs.createReadStream(fp).pipe(w);});
const sl=ms=>new Promise(r=>setTimeout(r,ms));
srv.listen(0,'127.0.0.1',async()=>{const b='http://127.0.0.1:'+srv.address().port;
 const br=await puppeteer.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const N of [2000,20000,60000]){
  const p=await br.newPage();await p.setViewport({width:390,height:844,deviceScaleFactor:3});
  await p.setRequestInterception(true);p.on('request',r=>{if(r.url().includes('/api/'))return r.respond({status:200,contentType:'application/json',body:'{}'});r.continue();});
  const side=Math.ceil(Math.sqrt(N)),cells=[];for(let i=0;i<N;i++)cells.push((465890-side/2+(i%side)|0)+','+(118937-side/2+Math.floor(i/side)|0));
  await p.goto(b+'/turf.html');await p.evaluate(c=>localStorage.setItem('turf_v3',JSON.stringify({onb:true,tut:{walk:1,loop:1,chest:1,rank:1,mission:1},c,xp:9000})),cells);
  const t0=Date.now();await p.reload({waitUntil:'load'});await sl(2500);const boot=Date.now()-t0;
  await p.emulateCPUThrottling(4);
  const r=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));let cb=null;
   navigator.geolocation.watchPosition=(ok)=>{cb=ok;return 1;};navigator.geolocation.clearWatch=()=>{};
   document.getElementById('btnGo').click();await w(500);document.querySelectorAll('.modal').forEach(m=>m.classList.remove('show'));
   const ts=[];let lat=35.70,lng=139.80;
   for(let i=0;i<40;i++){lat+=0.00016;const a=performance.now();cb({coords:{latitude:lat,longitude:lng,accuracy:6},timestamp:Date.now()+i*12000});ts.push(performance.now()-a);await w(30);}
   ts.sort((x,y)=>x-y);return {median:ts[20].toFixed(1),p90:ts[36].toFixed(1),max:ts[39].toFixed(1),bytes:localStorage.getItem('turf_v3').length};});
  console.log('cells',N,'boot(ms)',boot,'perFix(ms, 4x CPU)',JSON.stringify(r));await p.close();}
 await br.close();srv.close();});
